import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import path from "node:path";

const MAX_ANALYSIS_FILES = 256;
const MAX_INPUT_PATHS = 20_000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_JSON_NODES = 20_000;
const MAX_JSON_DEPTH = 32;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const JSON_SCHEMA_DIALECTS = new Set([
  "https://json-schema.org/draft/2020-12/schema",
  "https://json-schema.org/draft/2019-09/schema",
  "http://json-schema.org/draft-07/schema#",
  "http://json-schema.org/draft-06/schema#",
  "http://json-schema.org/draft-04/schema#",
]);
const SCHEMA_METADATA_KEYS = new Set(["$schema", "$id", "title", "description", "$comment", "examples", "deprecated", "readOnly", "writeOnly"]);
const SCHEMA_CONSTRAINT_KEYS = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "format", "minItems", "maxItems",
  "uniqueItems",
]);
const SCHEMA_PROPERTY_BOUND_KEYS = new Set(["minProperties", "maxProperties"]);
const SCHEMA_LENGTH_BOUND_KEYS = new Set(["minLength", "maxLength"]);
const SCHEMA_SUPPORTED_KEYS = new Set([
  ...SCHEMA_METADATA_KEYS, ...SCHEMA_CONSTRAINT_KEYS, ...SCHEMA_PROPERTY_BOUND_KEYS, ...SCHEMA_LENGTH_BOUND_KEYS,
  "type", "properties", "required", "dependentRequired", "additionalProperties", "items", "enum", "const",
]);

function safePath(filePath) {
  if (typeof filePath !== "string" || !filePath || filePath.length > 4096 || filePath.startsWith("/") || filePath.startsWith("\\") || /^[A-Za-z]:/.test(filePath) || filePath.includes("\\") || filePath.includes(":") || /[\u0000-\u001f\u007f]/.test(filePath)) {
    throw new Error("Evidence report encountered an unsafe repository path.");
  }
  const parts = filePath.split("/");
  if (parts.some((part) => !part || part === "." || part === "..") || path.posix.normalize(filePath) !== filePath) throw new Error("Evidence report encountered an unsafe repository path.");
  return filePath;
}

function safeText(value, max = 180) {
  if (typeof value !== "string" || value.length > max || /(?:^|[^A-Za-z0-9])(?:sk|pk|secret|token|password|credential)[-_:=]/i.test(value) || /\b(?:api|access|refresh|client|private|service)[\s_-]*(?:key|token|secret|password|credential)\s*[:=]/i.test(value) || /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/.test(value)) return "[redacted]";
  return value.replace(/[\r\n\t]/g, " ").trim() || "[unnamed]";
}

function verifyPathComponents(root, filePath) {
  let current = root;
  let finalStat = null;
  const parts = filePath.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT") return { current, missing: true };
      throw new Error("Evidence report could not verify repository paths safely.");
    }
    if (stat.isSymbolicLink()) throw new Error("Evidence report refuses symlink paths.");
    if (index < parts.length - 1 && !stat.isDirectory()) return { current, missing: true };
    finalStat = stat;
  }
  return { current, missing: false, stat: finalStat };
}

function readBoundedFile(root, rawPath, byteLimit = MAX_FILE_BYTES) {
  const filePath = safePath(rawPath);
  const verified = verifyPathComponents(root, filePath);
  if (verified.missing) return { status: "unavailable" };
  let descriptor;
  try {
    const noFollow = constants.O_NOFOLLOW || 0;
    descriptor = openSync(verified.current, constants.O_RDONLY | noFollow);
    const before = fstatSync(descriptor);
    const openedPath = verifyPathComponents(root, filePath);
    if (openedPath.missing || !openedPath.stat?.isFile() || openedPath.stat.dev !== before.dev || openedPath.stat.ino !== before.ino) return { status: "changed_during_read" };
    if (!before.isFile()) return { status: "unsupported_file_type" };
    if (before.size > byteLimit) return { status: byteLimit < MAX_FILE_BYTES ? "total_byte_budget_exceeded" : "oversize", sizeBytes: before.size };
    const bytes = Buffer.alloc(before.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(descriptor);
    if (offset !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) return { status: "changed_during_read" };
    const content = bytes.subarray(0, offset);
    return {
      status: "read",
      sizeBytes: content.length,
      content,
      fingerprint: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    };
  } catch (error) {
    if (error.code === "ELOOP") throw new Error("Evidence report refuses symlink paths.");
    return { status: "unavailable" };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseBoundedJson(bytes) {
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    return { status: "invalid_utf8" };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { status: "invalid_json" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "unsupported_json_shape" };
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) return { status: "json_budget_exceeded" };
    if (typeof current.value === "string" && current.value.length > 4096) return { status: "json_budget_exceeded" };
    if (!current.value || typeof current.value !== "object") continue;
    const entries = Array.isArray(current.value) ? current.value.entries() : Object.entries(current.value);
    for (const [key, child] of entries) {
      if (typeof key === "string" && key.length > 4096) return { status: "json_budget_exceeded" };
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  return { status: "parsed", value };
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function ownObject(record, key) {
  if (!Object.hasOwn(record, key)) return null;
  return plainObject(record[key]);
}

function dependencyRecords(manifest, manifestPath) {
  const records = [];
  const invalidScopes = [];
  let invalidSpecifiers = false;
  for (const scope of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    if (!Object.hasOwn(manifest, scope)) continue;
    const source = ownObject(manifest, scope);
    if (!source) {
      invalidScopes.push(scope);
      continue;
    }
    const names = Object.keys(source).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    for (const name of names.slice(0, MAX_JSON_NODES)) {
      const specifier = source[name];
      if (typeof specifier !== "string" || specifier.length > 4096) invalidSpecifiers = true;
      records.push({
        manifestPath: safeText(manifestPath),
        name: safeText(name, 214),
        _identity: name,
        scope,
        specifierKind: typeof specifier !== "string" ? "invalid" : /^(?:\^|~|>=?|<=?)?\d+(?:\.\d+|\.x|\.\*)*(?:[-+][A-Za-z0-9.-]+)?$/.test(specifier) ? "version_range" : /^(?:workspace:|file:|link:|git\+|https?:)/i.test(specifier) ? "non_registry_reference" : "opaque",
        _specifier: typeof specifier === "string" ? specifier : null,
      });
    }
  }
  return { records, invalidScopes, invalidSpecifiers };
}

function packageManifestEntry(file, bytes) {
  const parsed = parseBoundedJson(bytes);
  if (parsed.status !== "parsed") return { ...file, category: "package_manifest", analysisStatus: parsed.status };
  const manifest = parsed.value;
  const name = typeof manifest.name === "string" ? safeText(manifest.name, 214) : null;
  const version = typeof manifest.version === "string" && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version) ? "semver" : manifest.version === undefined ? "absent" : "opaque";
  const dependencies = dependencyRecords(manifest, file.path);
  return {
    ...file,
    category: "package_manifest",
    analysisStatus: "parsed_allowlisted_fields",
    ...(name ? { packageName: name } : {}),
    packageVersionKind: version,
    dependencies: dependencies.records,
    dependencySectionsStatus: dependencies.invalidScopes.length ? "invalid_sections" : dependencies.invalidSpecifiers ? "invalid_specifiers" : "valid_or_absent",
  };
}

function lockfileEntry(file, bytes) {
  const parsed = parseBoundedJson(bytes);
  if (parsed.status !== "parsed") return { ...file, category: "package_lock", analysisStatus: parsed.status };
  const lock = parsed.value;
  const packages = ownObject(lock, "packages");
  const rootPackage = packages && ownObject(packages, "");
  const supportedVersion = lock.lockfileVersion === 2 || lock.lockfileVersion === 3;
  const rootDependencies = supportedVersion && rootPackage ? dependencyRecords(rootPackage, file.path) : null;
  return {
    ...file,
    category: "package_lock",
    analysisStatus: !supportedVersion || !packages ? "unsupported_lockfile_shape" : rootDependencies?.invalidScopes.length ? "invalid_root_dependency_sections" : rootDependencies?.invalidSpecifiers ? "invalid_root_dependency_specifiers" : "parsed_allowlisted_fields",
    lockfileVersion: Number.isInteger(lock.lockfileVersion) ? lock.lockfileVersion : null,
    lockedPackageCount: supportedVersion && packages ? Math.max(0, Object.keys(packages).length - 1) : null,
    rootDependencyDeclarations: rootDependencies?.records || null,
  };
}

function contractEntry(file, bytes) {
  const parsed = parseBoundedJson(bytes);
  if (parsed.status !== "parsed") return { ...file, category: "contract_candidate", analysisStatus: parsed.status };
  const doc = parsed.value;
  const markers = [];
  for (const field of ["openapi", "swagger", "asyncapi", "$schema", "$id"]) if (typeof doc[field] === "string") markers.push(field);
  const status = markers.length ? "recognized_marker" : "candidate_unverified";
  const semantic = inspectJsonSchema(doc);
  return {
    ...file,
    category: "contract_candidate",
    analysisStatus: status,
    formatMarkers: markers,
    semanticAnalysisStatus: semantic.status,
    _schemaIdentity: semantic.identity,
    _schemaDialect: semantic.dialect,
    _schemaProfileStatus: semantic.status,
    _schemaModel: semantic.model,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

function validJsonSchemaNode(node, dialect, depth = 0, budget = { nodes: 0 }) {
  budget.nodes += 1;
  if (budget.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH || !node || typeof node !== "object" || Array.isArray(node)) return null;
  if (depth > 0 && (Object.hasOwn(node, "$schema") || Object.hasOwn(node, "$id"))) return null;
  if (Object.keys(node).some((key) => !SCHEMA_SUPPORTED_KEYS.has(key))) return null;
  const model = {};
  if (Object.hasOwn(node, "type")) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    const allowedTypes = new Set(["null", "boolean", "object", "array", "number", "integer", "string"]);
    if (!types.length || types.some((type) => typeof type !== "string" || !allowedTypes.has(type)) || new Set(types).size !== types.length) return null;
    model.type = [...types].sort();
  }
  if (Object.hasOwn(node, "properties")) {
    if (!node.properties || typeof node.properties !== "object" || Array.isArray(node.properties)) return null;
    const properties = Object.create(null);
    for (const name of Object.keys(node.properties).sort()) {
      const child = validJsonSchemaNode(node.properties[name], dialect, depth + 1, budget);
      if (!child) return null;
      properties[name] = child;
    }
    model.properties = properties;
  }
  if (Object.hasOwn(node, "required")) {
    if (!Array.isArray(node.required) || node.required.some((name) => typeof name !== "string") || new Set(node.required).size !== node.required.length) return null;
    model.required = [...node.required].sort();
  }
  if (Object.hasOwn(node, "dependentRequired")) {
    if (dialect !== "https://json-schema.org/draft/2020-12/schema" && dialect !== "https://json-schema.org/draft/2019-09/schema") return null;
    if (!node.dependentRequired || typeof node.dependentRequired !== "object" || Array.isArray(node.dependentRequired)) return null;
    const dependencies = Object.create(null);
    for (const trigger of Object.keys(node.dependentRequired).sort()) {
      const required = node.dependentRequired[trigger];
      if (!Array.isArray(required) || required.length === 0 || required.some((name) => typeof name !== "string" || name.length === 0) || new Set(required).size !== required.length) return null;
      dependencies[trigger] = [...required].sort();
    }
    model.dependentRequired = dependencies;
  }
  if (Object.hasOwn(node, "additionalProperties")) {
    if (typeof node.additionalProperties === "boolean") model.additionalProperties = node.additionalProperties;
    else {
      const child = validJsonSchemaNode(node.additionalProperties, dialect, depth + 1, budget);
      if (!child) return null;
      model.additionalProperties = child;
    }
  }
  if (Object.hasOwn(node, "items")) {
    if (Array.isArray(node.items)) return null;
    const child = validJsonSchemaNode(node.items, dialect, depth + 1, budget);
    if (!child) return null;
    model.items = child;
  }
  for (const key of ["enum", "const"]) {
    if (!Object.hasOwn(node, key)) continue;
    const values = key === "enum" ? node.enum : [node.const];
    if (key === "enum" && (!Array.isArray(values) || !values.length || new Set(values.map(canonicalJson)).size !== values.length)) return null;
    model[key] = key === "enum" ? values.map(canonicalJson).sort() : canonicalJson(values[0]);
  }
  const constraints = {};
  for (const key of SCHEMA_CONSTRAINT_KEYS) {
    if (!Object.hasOwn(node, key)) continue;
    const value = node[key];
    if ((typeof value === "number" && !Number.isFinite(value)) || (typeof value === "string" && value.length > 4096) || (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean")) return null;
    constraints[key] = value;
  }
  if (Object.keys(constraints).length) model.constraints = constraints;
  const propertyBounds = {};
  for (const key of SCHEMA_PROPERTY_BOUND_KEYS) {
    if (!Object.hasOwn(node, key)) continue;
    const value = node[key];
    if (!Number.isSafeInteger(value) || value < 0) return null;
    propertyBounds[key] = value;
  }
  if (Object.keys(propertyBounds).length) model.propertyBounds = propertyBounds;
  const lengthBounds = {};
  for (const key of SCHEMA_LENGTH_BOUND_KEYS) {
    if (!Object.hasOwn(node, key)) continue;
    const value = node[key];
    if (!Number.isSafeInteger(value) || value < 0) return null;
    lengthBounds[key] = value;
  }
  if (Object.keys(lengthBounds).length) model.lengthBounds = lengthBounds;
  const annotations = {};
  for (const key of ["deprecated", "readOnly", "writeOnly"]) {
    if (!Object.hasOwn(node, key)) continue;
    if (typeof node[key] !== "boolean") return null;
    annotations[key] = node[key];
  }
  if (Object.keys(annotations).length) model.annotations = annotations;
  return model;
}

function inspectJsonSchema(doc) {
  const identity = typeof doc.$id === "string" && doc.$id.length > 0 && doc.$id.length <= 2048 ? doc.$id : null;
  const dialect = typeof doc.$schema === "string" ? doc.$schema : null;
  if (!JSON_SCHEMA_DIALECTS.has(dialect)) return { status: "unsupported_format", identity, dialect, model: null };
  const model = validJsonSchemaNode(doc, dialect);
  return { status: model ? "supported_profile" : "unsupported_schema_features", identity, dialect, model };
}

function compareSchemaModels(left, right) {
  const changes = {
    typeChanges: 0, propertiesAdded: 0, propertiesRemoved: 0,
    requiredAdded: 0, requiredRemoved: 0, additionalPropertiesChanges: 0,
    dependentRequiredChanges: 0,
    propertyBoundChanges: 0,
    stringLengthBoundChanges: 0,
    itemsChanges: 0, enumChanges: 0, constChanges: 0, annotationChanges: 0,
    constraintChanges: 0, schemaShapeChanges: 0,
  };
  const visit = (a, b) => {
    for (const key of ["type", "enum", "const", "constraints", "annotations"]) {
      if (canonicalJson(a[key] ?? null) !== canonicalJson(b[key] ?? null)) {
        const counter = key === "type" ? "typeChanges" : key === "enum" ? "enumChanges" : key === "const" ? "constChanges" : key === "annotations" ? "annotationChanges" : "constraintChanges";
        changes[counter] += 1;
      }
    }
    const beforeRequired = new Set(a.required || []);
    const afterRequired = new Set(b.required || []);
    changes.requiredAdded += [...afterRequired].filter((name) => !beforeRequired.has(name)).length;
    changes.requiredRemoved += [...beforeRequired].filter((name) => !afterRequired.has(name)).length;
    const beforeDependencies = a.dependentRequired || {};
    const afterDependencies = b.dependentRequired || {};
    const triggerNames = new Set([...Object.keys(beforeDependencies), ...Object.keys(afterDependencies)]);
    changes.dependentRequiredChanges += [...triggerNames].filter((trigger) => canonicalJson(beforeDependencies[trigger] ?? null) !== canonicalJson(afterDependencies[trigger] ?? null)).length;
    const beforeBounds = a.propertyBounds || {};
    const afterBounds = b.propertyBounds || {};
    changes.propertyBoundChanges += [...new Set([...Object.keys(beforeBounds), ...Object.keys(afterBounds)])]
      .filter((key) => beforeBounds[key] !== afterBounds[key]).length;
    const beforeLengthBounds = a.lengthBounds || {};
    const afterLengthBounds = b.lengthBounds || {};
    changes.stringLengthBoundChanges += [...new Set([...Object.keys(beforeLengthBounds), ...Object.keys(afterLengthBounds)])]
      .filter((key) => beforeLengthBounds[key] !== afterLengthBounds[key]).length;
    if (canonicalJson(a.additionalProperties ?? null) !== canonicalJson(b.additionalProperties ?? null)) changes.additionalPropertiesChanges += 1;
    const beforeProperties = a.properties || {};
    const afterProperties = b.properties || {};
    const beforeNames = Object.keys(beforeProperties);
    const afterNames = Object.keys(afterProperties);
    changes.propertiesAdded += afterNames.filter((name) => !Object.hasOwn(beforeProperties, name)).length;
    changes.propertiesRemoved += beforeNames.filter((name) => !Object.hasOwn(afterProperties, name)).length;
    for (const name of beforeNames) if (Object.hasOwn(afterProperties, name)) visit(beforeProperties[name], afterProperties[name]);
    if (Object.hasOwn(a, "items") !== Object.hasOwn(b, "items")) changes.itemsChanges += 1;
    else if (a.items && b.items) visit(a.items, b.items);
  };
  visit(left, right);
  return changes;
}

function compareJsonSchemaContracts(entries) {
  const groups = new Map();
  const comparisons = entries.filter((entry) => !entry._schemaIdentity).map((entry) => ({
    status: "missing_identity",
    paths: [safeText(entry.path, 512)],
  }));
  for (const entry of entries) {
    if (!entry._schemaIdentity) continue;
    const group = groups.get(entry._schemaIdentity) || [];
    group.push(entry);
    groups.set(entry._schemaIdentity, group);
  }
  for (const group of groups.values()) {
    if (group.length !== 2) {
      comparisons.push({ status: group.length > 2 ? "ambiguous_identity" : "no_comparison_pair", paths: group.map(({ path: itemPath }) => safeText(itemPath, 512)).sort() });
      continue;
    }
    const [left, right] = [...group].sort((a, b) => a.path.localeCompare(b.path, "en"));
    if (left._schemaProfileStatus !== "supported_profile" || right._schemaProfileStatus !== "supported_profile" || left._schemaDialect !== right._schemaDialect) {
      comparisons.push({ status: "unsupported_schema_profile", leftPath: safeText(left.path, 512), rightPath: safeText(right.path, 512) });
      continue;
    }
    const changes = compareSchemaModels(left._schemaModel, right._schemaModel);
    comparisons.push({
      status: Object.values(changes).some(Boolean) ? "semantic_diff" : "semantically_equivalent_in_supported_profile",
      leftPath: safeText(left.path, 512), rightPath: safeText(right.path, 512), changes,
    });
  }
  return comparisons.sort((a, b) => `${a.leftPath || a.paths?.[0] || ""}\u0000${a.rightPath || a.paths?.[1] || ""}`.localeCompare(`${b.leftPath || b.paths?.[0] || ""}\u0000${b.rightPath || b.paths?.[1] || ""}`, "en"));
}

function categoryFor(filePath) {
  const basename = filePath.split("/").at(-1);
  if (basename === "package.json") return "package_manifest";
  if (basename === "package-lock.json") return "package_lock";
  if (/\.sql$/i.test(basename) && /(?:^|\/)migrations\//i.test(filePath)) return "migration";
  if (/\.json$/i.test(basename) && (/(?:^|\/)(?:contracts?|schemas?)\//i.test(filePath) || /^(?:openapi|asyncapi|.*\.schema)\.json$/i.test(basename))) return "contract_candidate";
  return null;
}

function gitState(filePath, states) {
  const code = states.get(filePath);
  if (!code) return "clean";
  if (code === "??") return "untracked";
  return `changed:${code}`;
}

function compareManifestDependencies(manifests, locks) {
  const output = [];
  for (const manifest of manifests.filter((entry) => entry.category === "package_manifest" && entry.analysisStatus === "parsed_allowlisted_fields")) {
    const lock = locks.find((candidate) => candidate.path === (manifest.path === "package.json" ? "package-lock.json" : `${manifest.path.slice(0, -"package.json".length)}package-lock.json`));
    const declarations = manifest.dependencies || [];
    if (manifest.dependencySectionsStatus !== "valid_or_absent") {
      output.push({ manifestPath: manifest.path, lockfilePath: lock?.path || null, status: "unknown_invalid_manifest_dependency_metadata" });
      continue;
    }
    if (!lock || lock.analysisStatus !== "parsed_allowlisted_fields" || !Array.isArray(lock.rootDependencyDeclarations)) {
      output.push({ manifestPath: manifest.path, lockfilePath: lock?.path || null, status: "unknown_no_supported_matching_lockfile" });
      continue;
    }
    const lockedDeclarations = lock.rootDependencyDeclarations;
    if ([...declarations, ...lockedDeclarations].some((item) => item._specifier === null)) {
      output.push({ manifestPath: manifest.path, lockfilePath: lock.path, status: "unknown_invalid_dependency_specifier" });
      continue;
    }
    const keyOf = (item) => `${item.scope}\u0000${item._identity}`;
    const exactMap = new Map(lockedDeclarations.map((item) => [keyOf(item), item._specifier]));
    const declaredKeys = new Set(declarations.map(keyOf));
    const missing = declarations.filter((item) => !exactMap.has(keyOf(item))).map((item) => item.name);
    const differs = declarations.filter((item) => exactMap.has(keyOf(item)) && exactMap.get(keyOf(item)) !== item._specifier).map((item) => item.name);
    const lockOnly = lockedDeclarations.filter((item) => !declaredKeys.has(keyOf(item))).map((item) => item.name);
    output.push({ manifestPath: manifest.path, lockfilePath: lock.path, status: missing.length || differs.length || lockOnly.length ? "declaration_diff" : "direct_declarations_match_exactly_by_name_scope_and_specifier", missingFromLockfile: missing, differentSpecifiers: differs, lockfileOnly: lockOnly });
  }
  return output;
}

/**
 * Produce a bounded, read-only metadata report. This reads selected JSON manifests,
 * candidate contract JSON, and migration bytes for a digest only; it never returns
 * file contents, evaluates repository text, or executes SQL/migrations.
 */
export function buildRepositoryEvidenceReport({ repositoryRoot, files = [], status = new Map() } = {}) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot) || !Array.isArray(files) || files.length > MAX_INPUT_PATHS || !(status instanceof Map) || status.size > MAX_INPUT_PATHS) throw new TypeError("Evidence report input is invalid.");
  const root = path.resolve(repositoryRoot);
  let verifiedRoot;
  try {
    verifiedRoot = realpathSync(root);
  } catch {
    throw new Error("Evidence report requires an existing repository directory.");
  }
  if (verifiedRoot !== root || !lstatSync(root).isDirectory()) throw new Error("Evidence report refuses a symlink or invalid repository root.");
  for (const [filePath, code] of status) {
    safePath(filePath);
    if (typeof code !== "string" || !/^(?:\?\?|[ MADRCTU]{2})$/.test(code) || code === "  ") throw new TypeError("Evidence report status input is invalid.");
  }
  const seenPaths = new Set();
  const candidates = files.map((filePath) => {
    if (typeof filePath !== "string") throw new TypeError("Evidence report paths must be strings.");
    const safeFilePath = safePath(filePath);
    if (seenPaths.has(safeFilePath)) throw new TypeError("Evidence report paths must be unique.");
    seenPaths.add(safeFilePath);
    return { path: safeFilePath, category: categoryFor(safeFilePath) };
  }).filter((entry) => entry.category).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const selected = candidates.slice(0, MAX_ANALYSIS_FILES);
  const entries = [];
  let totalBytes = 0;
  for (const candidate of selected) {
    const base = { path: candidate.path, gitState: gitState(candidate.path, status) };
    if (totalBytes >= MAX_TOTAL_BYTES) {
      entries.push({ ...base, category: candidate.category, analysisStatus: "total_byte_budget_exceeded" });
      continue;
    }
    const byteLimit = Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - totalBytes);
    const read = readBoundedFile(root, candidate.path, byteLimit);
    if (read.status !== "read") {
      entries.push({ ...base, category: candidate.category, analysisStatus: read.status, ...(read.sizeBytes ? { sizeBytes: read.sizeBytes } : {}) });
      continue;
    }
    totalBytes += read.sizeBytes;
    const evidenceFile = { ...base, sizeBytes: read.sizeBytes, fingerprint: read.fingerprint };
    if (candidate.category === "package_manifest") entries.push(packageManifestEntry(evidenceFile, read.content));
    else if (candidate.category === "package_lock") entries.push(lockfileEntry(evidenceFile, read.content));
    else if (candidate.category === "contract_candidate") entries.push(contractEntry(evidenceFile, read.content));
    else {
      const basename = candidate.path.split("/").at(-1);
      const migrationName = /^(\d{14})_(.+)\.sql$/i.exec(basename);
      entries.push({
        ...evidenceFile,
        category: "migration_candidate",
        analysisStatus: migrationName ? "path_and_digest_only" : "unrecognized_migration_filename",
        ...(migrationName ? { migrationTimestamp: migrationName[1] } : {}),
      });
    }
  }
  const packageManifests = entries.filter((entry) => entry.category === "package_manifest");
  const lockfiles = entries.filter((entry) => entry.category === "package_lock");
  const contractEntries = entries.filter((entry) => entry.category === "contract_candidate");
  const publicDependencies = (values) => (values || []).map(({ _specifier, _identity, ...entry }) => entry);
  const dependencies = packageManifests.flatMap((entry) => publicDependencies(entry.dependencies));
  const artifactCount = candidates.length;
  const migrationTimestampGroups = new Map();
  for (const candidate of candidates.filter((entry) => entry.category === "migration")) {
    const filename = candidate.path.split("/").at(-1);
    const match = /^(\d{14})_(.+)\.sql$/i.exec(filename);
    if (match) migrationTimestampGroups.set(match[1], [...(migrationTimestampGroups.get(match[1]) || []), candidate.path]);
  }
  const migrationTimestampCollisions = [...migrationTimestampGroups.entries()].filter(([, paths]) => paths.length > 1).map(([timestamp, paths]) => ({ timestamp, paths: paths.map((filePath) => safeText(filePath, 512)) }));
  return {
    schemaVersion: 1,
    mode: "read_only_metadata_evidence",
    coverage: {
      supportedPathCandidates: artifactCount,
      analyzedPathCandidates: selected.length,
      skippedByFileLimit: Math.max(0, artifactCount - selected.length),
      parsedBytes: totalBytes,
      limits: { inputPaths: MAX_INPUT_PATHS, files: MAX_ANALYSIS_FILES, bytesPerFile: MAX_FILE_BYTES, totalBytes: MAX_TOTAL_BYTES, jsonNodes: MAX_JSON_NODES, jsonDepth: MAX_JSON_DEPTH },
    },
    entries: entries.map((entry) => {
      const publicEntry = Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith("_schema")));
      return {
        ...publicEntry,
        path: safeText(entry.path, 512),
        ...(entry.dependencies ? { dependencies: publicDependencies(entry.dependencies) } : {}),
        ...(Array.isArray(entry.rootDependencyDeclarations) ? { rootDependencyDeclarations: publicDependencies(entry.rootDependencyDeclarations) } : {}),
      };
    }),
    dependencies,
    manifestLockDiff: compareManifestDependencies(packageManifests, lockfiles).map((diff) => ({
      ...diff,
      manifestPath: safeText(diff.manifestPath, 512),
      ...(diff.lockfilePath ? { lockfilePath: safeText(diff.lockfilePath, 512) } : {}),
    })),
    contractSemanticComparisons: compareJsonSchemaContracts(contractEntries),
    migrationTimestampCollisions,
    conclusions: ["Classification is limited to recognized paths and allowlisted metadata.", "Migration files are hashed and classified by path only; SQL is not parsed or executed.", "Matching direct dependency declarations prove exact text equality only; they do not prove lockfile correctness or runtime compatibility.", "Semantic comparisons cover a bounded JSON Schema profile paired by identical $id and dialect; compared dimensions include types, property/required membership and cardinality bounds, dependentRequired rules, additionalProperties, items, enum/const, selected scalar constraints, and read/write/deprecation annotations. This is not full standards validation.", "dependentRequired is supported only for the 2019-09 and 2020-12 dialects; minProperties/maxProperties and minLength/maxLength are supported as non-negative safe integers in the listed dialects.", "OpenAPI, AsyncAPI, YAML, references, and unsupported JSON Schema features are not semantically compared.", "Contract comparison paths are sorted lexically as left and right; that ordering does not imply version chronology.", "Unrecognized files and formats remain outside this report."],
  };
}
