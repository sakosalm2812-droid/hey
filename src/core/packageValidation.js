const SPDX_ALLOWLIST = new Set(["0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "BSL-1.0", "CC0-1.0", "EPL-2.0", "GPL-2.0-only", "GPL-3.0-only", "ISC", "LGPL-2.1-only", "LGPL-3.0-only", "MIT", "MPL-2.0", "Unlicense", "Zlib"]);
const SCHEMA_KEYS = new Set(["type", "required", "properties", "additionalProperties", "enum", "minimum", "maximum", "minLength", "maxLength", "pattern", "items", "minItems", "maxItems"]);

export function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
}

export function packageSigningPayload(pkg) {
  return stableJson({ name: pkg.name, version: pkg.version, description: pkg.description || "", manifest: pkg.manifest, schemaId: pkg.schemaId || null, dependencies: pkg.dependencies || [], compatibility: pkg.compatibility || [], licenses: pkg.licenses || [] });
}

export function validateJsonSchemaDefinition(schema, path = "$schema") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [path + " must be an object."];
  const errors = [];
  for (const key of Object.keys(schema)) if (!SCHEMA_KEYS.has(key)) errors.push(path + " uses unsupported keyword " + key + ".");
  if (schema.type !== undefined && !["object", "array", "string", "number", "integer", "boolean", "null"].includes(schema.type)) errors.push(path + ".type is unsupported.");
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== "string"))) errors.push(path + ".required must be an array of property names.");
  if (schema.properties !== undefined && (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties))) errors.push(path + ".properties must be an object.");
  else for (const [key, child] of Object.entries(schema.properties || {})) errors.push(...validateJsonSchemaDefinition(child, path + ".properties." + key));
  if (schema.items !== undefined) errors.push(...validateJsonSchemaDefinition(schema.items, path + ".items"));
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") errors.push(path + ".additionalProperties must be boolean.");
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) errors.push(path + ".enum must be a non-empty array.");
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) if (schema[key] !== undefined && (!Number.isFinite(schema[key]) || schema[key] < 0)) errors.push(path + "." + key + " must be a non-negative number.");
  if (schema.pattern !== undefined) { try { new RegExp(schema.pattern); } catch { errors.push(path + ".pattern is invalid."); } }
  return errors;
}

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type && (type !== "number" || Number.isFinite(value));
}

export function validateAgainstSchema(value, schema, path = "manifest") {
  const errors = validateJsonSchemaDefinition(schema);
  if (errors.length) return errors;
  if (schema.type && !matchesType(value, schema.type)) return [path + " must be " + schema.type + "."];
  if (schema.enum && !schema.enum.some((candidate) => stableJson(candidate) === stableJson(value))) errors.push(path + " is not an allowed value.");
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(path + " is shorter than minLength.");
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(path + " exceeds maxLength.");
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(path + " does not match its pattern.");
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(path + " is below minimum.");
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(path + " exceeds maximum.");
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(path + " has too few items.");
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(path + " has too many items.");
    if (schema.items) value.forEach((item, index) => errors.push(...validateAgainstSchema(item, schema.items, path + "[" + index + "]")));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(path + "." + key + " is required.");
    for (const [key, child] of Object.entries(schema.properties || {})) if (Object.hasOwn(value, key)) errors.push(...validateAgainstSchema(value[key], child, path + "." + key));
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties || {}, key)) errors.push(path + "." + key + " is not allowed.");
  }
  return errors;
}

export function validateSpdxLicenses(licenses) {
  if (!Array.isArray(licenses) || licenses.length === 0) return { valid: false, errors: ["At least one declared SPDX license identifier is required."] };
  const errors = licenses.filter((license) => typeof license !== "string" || !SPDX_ALLOWLIST.has(license)).map((license) => "Unknown or unsupported SPDX license: " + String(license) + ".");
  return { valid: errors.length === 0, errors };
}

function decodeBase64(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    if (typeof atob === "function") return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    return new Uint8Array(Buffer.from(value, "base64"));
  } catch { return null; }
}

export async function verifyPackageSignature(pkg, trustedKeys = {}) {
  const signature = pkg.signature;
  if (!signature || signature.algorithm !== "Ed25519" || typeof signature.keyId !== "string") return false;
  const encodedKey = trustedKeys instanceof Map ? trustedKeys.get(signature.keyId) : trustedKeys[signature.keyId];
  const publicBytes = decodeBase64(encodedKey);
  const signatureBytes = decodeBase64(signature.value);
  if (!publicBytes || publicBytes.length !== 32 || !signatureBytes || signatureBytes.length !== 64 || !globalThis.crypto?.subtle) return false;
  try {
    const key = await globalThis.crypto.subtle.importKey("raw", publicBytes, { name: "Ed25519" }, false, ["verify"]);
    return await globalThis.crypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, new TextEncoder().encode(packageSigningPayload(pkg)));
  } catch { return false; }
}

export function dependencyEntries(dependencies) {
  if (!Array.isArray(dependencies)) return null;
  const entries = [];
  for (const dependency of dependencies) {
    if (dependency && typeof dependency === "object" && typeof dependency.name === "string" && typeof dependency.version === "string") {
      entries.push({ name: dependency.name, version: dependency.version });
      continue;
    }
    if (typeof dependency === "string") {
      const separator = dependency.lastIndexOf("@");
      if (separator > 0 && separator < dependency.length - 1) {
        entries.push({ name: dependency.slice(0, separator), version: dependency.slice(separator + 1) });
        continue;
      }
    }
    return null;
  }
  return entries;
}

export function versionSatisfies(actual, requested) {
  const actualMatch = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(actual || "");
  const requestedMatch = /^(\^|~)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(requested || "");
  if (!actualMatch || !requestedMatch) return false;
  const actualParts = actualMatch.slice(1).map(Number);
  const requestedParts = requestedMatch.slice(2).map(Number);
  if (!requestedMatch[1]) return actualParts.every((part, index) => part === requestedParts[index]);
  if (actualParts[0] !== requestedParts[0]) return false;
  if (requestedMatch[1] === "~") return actualParts[1] === requestedParts[1] && actualParts[2] >= requestedParts[2];
  if (requestedParts[0] > 0) return actualParts[1] > requestedParts[1] || (actualParts[1] === requestedParts[1] && actualParts[2] >= requestedParts[2]);
  if (requestedParts[1] > 0) return actualParts[1] === requestedParts[1] && actualParts[2] >= requestedParts[2];
  return actualParts[1] === 0 && actualParts[2] === requestedParts[2];
}
