import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRepositoryEvidenceReport } from "../scripts/repository-evidence.mjs";

function withRoot(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "hey-evidence-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeJson(root, filePath, value) {
  const target = path.join(root, filePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(value));
}

test("evidence report classifies bounded metadata and shows exact direct dependency and Git-state evidence", () => {
  withRoot((root) => {
    writeJson(root, "package.json", {
      name: "demo-app",
      version: "1.2.3",
      dependencies: { react: "^19.0.0", "token-secret-value": "https://private.invalid/token-secret-value" },
      scripts: { preinstall: "node -e \"require('fs').writeFileSync('package-script-ran', 'bad')\"" },
      auth: "secret:never-return-this",
    });
    writeJson(root, "package-lock.json", {
      name: "demo-app",
      lockfileVersion: 3,
      packages: {
        "": { name: "demo-app", dependencies: { react: "^19.0.0", "token-secret-value": "https://private.invalid/token-secret-value" } },
        "node_modules/react": { version: "19.0.0" },
      },
    });
    writeJson(root, "contracts/account.schema.json", { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", description: "never-return-this-contract-text", properties: {} });
    const migrationPath = "supabase/migrations/20261015000100_first.sql";
    const secondMigrationPath = "supabase/migrations/20261015000100_second.sql";
    for (const filePath of [migrationPath, secondMigrationPath]) {
      const target = path.join(root, filePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, "-- password=never-return-this-migration\nselect 1;\n");
    }

    const report = buildRepositoryEvidenceReport({
      repositoryRoot: root,
      files: ["package.json", "package-lock.json", "contracts/account.schema.json", migrationPath, secondMigrationPath],
      status: new Map([["package.json", " M"], ["contracts/account.schema.json", "??"]]),
    });
    const manifest = report.entries.find(({ category }) => category === "package_manifest");
    const contract = report.entries.find(({ category }) => category === "contract_candidate");
    const migration = report.entries.find(({ path: itemPath }) => itemPath === migrationPath);

    assert.equal(manifest.packageName, "demo-app");
    assert.equal(manifest.gitState, "changed: M");
    assert.equal(manifest.dependencies[0].specifierKind, "version_range");
    assert.equal(report.manifestLockDiff[0].status, "direct_declarations_match_exactly_by_name_scope_and_specifier");
    assert.equal(contract.analysisStatus, "recognized_marker");
    assert.equal(contract.gitState, "untracked");
    assert.equal(migration.analysisStatus, "path_and_digest_only");
    assert.match(migration.fingerprint, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(report.migrationTimestampCollisions, [{ timestamp: "20261015000100", paths: [migrationPath, secondMigrationPath] }]);
    assert.equal(report.mode, "read_only_metadata_evidence");
    assert.equal(existsSync(path.join(root, "package-script-ran")), false);
    assert.doesNotMatch(JSON.stringify(report), /package-script-ran|never-return-this|private\.invalid|password=/);
  });
});

test("evidence report exposes mismatched and unknown dependency diffs without version values", () => {
  withRoot((root) => {
    writeJson(root, "package.json", { dependencies: { alpha: "^1.0.0", beta: "workspace:*" } });
    writeJson(root, "package-lock.json", { lockfileVersion: 3, packages: { "": { dependencies: { alpha: "^2.0.0", extra: "~4.0.0" } } } });
    const report = buildRepositoryEvidenceReport({ repositoryRoot: root, files: ["package.json", "package-lock.json"] });
    assert.deepEqual(report.manifestLockDiff[0], {
      manifestPath: "package.json",
      lockfilePath: "package-lock.json",
      status: "declaration_diff",
      missingFromLockfile: ["beta"],
      differentSpecifiers: ["alpha"],
      lockfileOnly: ["extra"],
    });
    assert.doesNotMatch(JSON.stringify(report), /\^1\.0\.0|\^2\.0\.0|workspace:\*|~4\.0\.0/);
  });
});

test("evidence report leaves malformed dependency structures unknown instead of claiming a match", () => {
  withRoot((root) => {
    writeJson(root, "package.json", { dependencies: { alpha: null } });
    writeJson(root, "package-lock.json", { lockfileVersion: 3, packages: { "": { dependencies: { alpha: null } } } });
    const report = buildRepositoryEvidenceReport({ repositoryRoot: root, files: ["package.json", "package-lock.json"] });
    assert.equal(report.manifestLockDiff[0].status, "unknown_invalid_manifest_dependency_metadata");
    assert.notEqual(report.manifestLockDiff[0].status, "direct_declarations_match_exactly_by_name_scope_and_specifier");
  });
});

test("evidence report marks malformed, unsupported, and oversized inputs without returning contents", () => {
  withRoot((root) => {
    writeFileSync(path.join(root, "package.json"), "{ malformed secret: do-not-echo }");
    writeJson(root, "package-lock.json", { lockfileVersion: 1, dependencies: { alpha: { version: "1.0.0" } } });
    const oversizedPath = "contracts/oversized.schema.json";
    const target = path.join(root, oversizedPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `{"$schema":"https://example.invalid","payload":"${"x".repeat(256 * 1024)}"}`);
    const report = buildRepositoryEvidenceReport({ repositoryRoot: root, files: ["package.json", "package-lock.json", oversizedPath] });
    assert.equal(report.entries.find(({ path: itemPath }) => itemPath === "package.json").analysisStatus, "invalid_json");
    assert.equal(report.entries.find(({ path: itemPath }) => itemPath === "package-lock.json").analysisStatus, "unsupported_lockfile_shape");
    assert.equal(report.entries.find(({ path: itemPath }) => itemPath === oversizedPath).analysisStatus, "oversize");
    assert.doesNotMatch(JSON.stringify(report), /do-not-echo|"x{100}/);
  });
});

test("evidence report enforces JSON depth and node budgets", () => {
  withRoot((root) => {
    const deepPath = path.join(root, "contracts", "deep.schema.json");
    const widePath = path.join(root, "contracts", "wide.schema.json");
    mkdirSync(path.dirname(deepPath), { recursive: true });
    writeFileSync(deepPath, `{"$schema":"x","nested":${"[".repeat(34)}0${"]".repeat(34)}}`);
    writeFileSync(widePath, `{"$schema":"x","values":[${Array.from({ length: 20_001 }, () => "0").join(",")}]}`);
    const report = buildRepositoryEvidenceReport({ repositoryRoot: root, files: ["contracts/deep.schema.json", "contracts/wide.schema.json"] });
    assert.equal(report.entries.find(({ path: itemPath }) => itemPath.endsWith("deep.schema.json")).analysisStatus, "json_budget_exceeded");
    assert.equal(report.entries.find(({ path: itemPath }) => itemPath.endsWith("wide.schema.json")).analysisStatus, "json_budget_exceeded");
  });
});

test("bounded JSON Schema comparison reports structural contract changes without returning contract content", () => {
  withRoot((root) => {
    const beforePath = "contracts/a-before.schema.json";
    const afterPath = "contracts/z-after.schema.json";
    const sharedId = "https://schemas.example.invalid/account";
    const before = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: sharedId,
      title: "private title text",
      type: "object",
      properties: {
        name: { type: "string", maxLength: 80 },
        "api_key=private-secret-value": { type: "string", enum: ["alpha", "beta"] },
      },
      required: ["name"],
      additionalProperties: false,
    };
    const after = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: sharedId,
      title: "different private title",
      type: "object",
      properties: {
        name: { type: "integer", maxLength: 80 },
        "api_key=private-secret-value": { type: "string", enum: ["alpha", "gamma"] },
        optionalField: { type: "boolean" },
      },
      required: ["name", "optionalField"],
      additionalProperties: true,
    };
    writeJson(root, beforePath, before);
    writeJson(root, afterPath, after);
    const originalBefore = Buffer.from(JSON.stringify(before));
    const originalAfter = Buffer.from(JSON.stringify(after));
    const report = buildRepositoryEvidenceReport({ repositoryRoot: root, files: [beforePath, afterPath] });
    const comparison = report.contractSemanticComparisons[0];
    assert.equal(comparison.status, "semantic_diff");
    assert.deepEqual(comparison.changes, {
      typeChanges: 1,
      propertiesAdded: 1,
      propertiesRemoved: 0,
      requiredAdded: 1,
      requiredRemoved: 0,
      additionalPropertiesChanges: 1,
      dependentRequiredChanges: 0,
      propertyBoundChanges: 0,
      itemsChanges: 0,
      enumChanges: 1,
      constChanges: 0,
      annotationChanges: 0,
      constraintChanges: 0,
      schemaShapeChanges: 0,
    });
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /private title text|private-secret-value|alpha|gamma|schemas\.example\.invalid\/account/);
    assert.ok(report.entries.every((entry) => !Object.keys(entry).some((key) => key.startsWith("_schema"))));
    assert.deepEqual(readFileSync(path.join(root, beforePath)), originalBefore);
    assert.deepEqual(readFileSync(path.join(root, afterPath)), originalAfter);
  });
});

test("dependentRequired contracts compare trigger rules as sorted sets without exposing property names", () => {
  withRoot((root) => {
    const dialect = "https://json-schema.org/draft/2020-12/schema";
    writeJson(root, "contracts/a-dependent.schema.json", {
      $schema: dialect,
      $id: "dependent-contract",
      dependentRequired: { "api_key=private-secret": ["email", "phone"], active: ["reason"] },
    });
    writeJson(root, "contracts/z-dependent.schema.json", {
      $schema: dialect,
      $id: "dependent-contract",
      dependentRequired: { active: ["reason"], "api_key=private-secret": ["phone", "email"], state: ["stateReason"] },
    });
    const report = buildRepositoryEvidenceReport({
      repositoryRoot: root,
      files: ["contracts/a-dependent.schema.json", "contracts/z-dependent.schema.json"],
    });
    const comparison = report.contractSemanticComparisons[0];
    assert.equal(comparison.status, "semantic_diff");
    assert.equal(comparison.changes.dependentRequiredChanges, 1);
    assert.doesNotMatch(JSON.stringify(report), /dependent-contract|api_key=private-secret|email|phone|stateReason/);
  });
});

test("dependentRequired fails closed for malformed relationships and dialects that do not define it", () => {
  withRoot((root) => {
    writeJson(root, "contracts/a-invalid.schema.json", {
      $schema: "https://json-schema.org/draft/2020-12/schema", $id: "invalid-dependent", dependentRequired: { trigger: "must-be-an-array" },
    });
    writeJson(root, "contracts/b-invalid.schema.json", {
      $schema: "https://json-schema.org/draft/2020-12/schema", $id: "invalid-dependent", dependentRequired: { trigger: ["ok", "ok"] },
    });
    writeJson(root, "contracts/a-legacy.schema.json", {
      $schema: "http://json-schema.org/draft-07/schema#", $id: "legacy-dependent", dependentRequired: { trigger: ["required"] },
    });
    writeJson(root, "contracts/b-legacy.schema.json", {
      $schema: "http://json-schema.org/draft-07/schema#", $id: "legacy-dependent", type: "object",
    });
    const report = buildRepositoryEvidenceReport({
      repositoryRoot: root,
      files: ["contracts/a-invalid.schema.json", "contracts/b-invalid.schema.json", "contracts/a-legacy.schema.json", "contracts/b-legacy.schema.json"],
    });
    assert.ok(report.contractSemanticComparisons.every(({ status }) => status === "unsupported_schema_profile"));
    assert.ok(report.entries.filter(({ path: itemPath }) => itemPath.includes("invalid")).every(({ semanticAnalysisStatus }) => semanticAnalysisStatus === "unsupported_schema_features"));
    assert.equal(report.entries.find(({ path: itemPath }) => itemPath.includes("a-legacy")).semanticAnalysisStatus, "unsupported_schema_features");
    assert.equal(report.entries.find(({ path: itemPath }) => itemPath.includes("b-legacy")).semanticAnalysisStatus, "supported_profile");
    assert.doesNotMatch(JSON.stringify(report), /invalid-dependent|legacy-dependent|must-be-an-array/);
  });
});

test("minProperties and maxProperties compare non-negative safe integer bounds including zero", () => {
  withRoot((root) => {
    const dialect = "https://json-schema.org/draft/2020-12/schema";
    writeJson(root, "contracts/a-bounds.schema.json", {
      $schema: dialect,
      $id: "property-bounds",
      minProperties: 0,
      maxProperties: Number.MAX_SAFE_INTEGER,
    });
    writeJson(root, "contracts/z-bounds.schema.json", {
      $schema: dialect,
      $id: "property-bounds",
      minProperties: 1,
      maxProperties: Number.MAX_SAFE_INTEGER,
    });
    const report = buildRepositoryEvidenceReport({
      repositoryRoot: root,
      files: ["contracts/a-bounds.schema.json", "contracts/z-bounds.schema.json"],
    });
    const comparison = report.contractSemanticComparisons[0];
    assert.equal(comparison.status, "semantic_diff");
    assert.equal(comparison.changes.propertyBoundChanges, 1);
    assert.doesNotMatch(JSON.stringify(report), /property-bounds|9007199254740991/);
  });
});

test("property bounds reject malformed, negative, fractional, and imprecise values and unsupported schema dialects", () => {
  withRoot((root) => {
    const modern = "https://json-schema.org/draft/2020-12/schema";
    for (const [id, key, value] of [
      ["negative", "minProperties", -1],
      ["fractional", "maxProperties", 1.5],
      ["string", "minProperties", "0"],
      ["unsafe", "maxProperties", Number.MAX_SAFE_INTEGER + 1],
    ]) {
      writeJson(root, `contracts/a-${id}.schema.json`, { $schema: modern, $id: id, [key]: value });
      writeJson(root, `contracts/z-${id}.schema.json`, { $schema: modern, $id: id, minProperties: 0 });
    }
    const unsupported = "http://json-schema.org/draft-03/schema#";
    writeJson(root, "contracts/a-unsupported-dialect.schema.json", { $schema: unsupported, $id: "unsupported-dialect", minProperties: 0 });
    writeJson(root, "contracts/z-unsupported-dialect.schema.json", { $schema: unsupported, $id: "unsupported-dialect", maxProperties: 10 });
    const paths = [
      "contracts/a-negative.schema.json", "contracts/z-negative.schema.json",
      "contracts/a-fractional.schema.json", "contracts/z-fractional.schema.json",
      "contracts/a-string.schema.json", "contracts/z-string.schema.json",
      "contracts/a-unsafe.schema.json", "contracts/z-unsafe.schema.json",
      "contracts/a-unsupported-dialect.schema.json", "contracts/z-unsupported-dialect.schema.json",
    ];
    const report = buildRepositoryEvidenceReport({ repositoryRoot: root, files: paths });
    assert.ok(report.entries.filter(({ path: itemPath }) => /a-(?:negative|fractional|string|unsafe)\.schema\.json$/.test(itemPath)).every(({ semanticAnalysisStatus }) => semanticAnalysisStatus === "unsupported_schema_features"));
    assert.ok(report.entries.filter(({ path: itemPath }) => /z-(?:negative|fractional|string|unsafe)\.schema\.json$/.test(itemPath)).every(({ semanticAnalysisStatus }) => semanticAnalysisStatus === "supported_profile"));
    assert.ok(report.entries.filter(({ path: itemPath }) => itemPath.includes("unsupported-dialect")).every(({ semanticAnalysisStatus }) => semanticAnalysisStatus === "unsupported_format"));
    assert.ok(report.contractSemanticComparisons.every(({ status }) => status === "unsupported_schema_profile"));
    assert.doesNotMatch(JSON.stringify(report), /9007199254740992/);
  });
});

test("JSON Schema comparison treats object and set ordering plus descriptive metadata as non-semantic", () => {
  withRoot((root) => {
    const common = { $schema: "https://json-schema.org/draft/2020-12/schema", $id: "same-contract", type: ["string", "null"] };
    writeJson(root, "contracts/a.schema.json", {
      ...common,
      title: "private title one",
      required: ["alpha", "beta"],
      properties: { alpha: { enum: ["one", "two"] }, beta: { type: "boolean" } },
    });
    writeJson(root, "contracts/b.schema.json", {
      ...common,
      type: ["null", "string"],
      title: "private title two",
      required: ["beta", "alpha"],
      properties: { beta: { type: "boolean" }, alpha: { enum: ["two", "one"] } },
    });
    const report = buildRepositoryEvidenceReport({ repositoryRoot: root, files: ["contracts/a.schema.json", "contracts/b.schema.json"] });
    assert.equal(report.contractSemanticComparisons[0].status, "semantically_equivalent_in_supported_profile");
    assert.ok(Object.values(report.contractSemanticComparisons[0].changes).every((count) => count === 0));
    assert.doesNotMatch(JSON.stringify(report), /private title one|private title two|same-contract/);
  });
});

test("JSON Schema semantic comparison fails closed for references, unknown formats, missing identity, and ambiguous identity", () => {
  withRoot((root) => {
    const base = { $schema: "https://json-schema.org/draft/2020-12/schema", $id: "schema-id", type: "object" };
    writeJson(root, "contracts/ref-a.schema.json", { ...base, $ref: "#/$defs/item" });
    writeJson(root, "contracts/ref-b.schema.json", { ...base, $ref: "#/$defs/other" });
    writeJson(root, "contracts/no-id.schema.json", { $schema: base.$schema, type: "string" });
    writeJson(root, "contracts/ambiguous-a.schema.json", base);
    writeJson(root, "contracts/ambiguous-b.schema.json", base);
    writeJson(root, "contracts/ambiguous-c.schema.json", base);
    writeJson(root, "contracts/openapi-a.schema.json", { openapi: "3.1.0", $id: "api-id", paths: { "/private": { get: { summary: "never-return-this" } } } });
    writeJson(root, "contracts/openapi-b.schema.json", { openapi: "3.1.0", $id: "api-id", paths: {} });
    writeJson(root, "contracts/dialect-a.schema.json", { ...base, $id: "dialect-id" });
    writeJson(root, "contracts/dialect-b.schema.json", { ...base, $id: "dialect-id", $schema: "http://json-schema.org/draft-07/schema#" });
    writeJson(root, "contracts/prototype-a.schema.json", { ...base, $id: "prototype-id", properties: Object.fromEntries([["__proto__", { type: "string" }]]) });
    writeJson(root, "contracts/prototype-b.schema.json", { ...base, $id: "prototype-id", properties: Object.fromEntries([["__proto__", { type: "number" }]]) });
    const report = buildRepositoryEvidenceReport({
      repositoryRoot: root,
      files: ["contracts/ref-a.schema.json", "contracts/ref-b.schema.json", "contracts/no-id.schema.json", "contracts/ambiguous-a.schema.json", "contracts/ambiguous-b.schema.json", "contracts/ambiguous-c.schema.json", "contracts/openapi-a.schema.json", "contracts/openapi-b.schema.json", "contracts/dialect-a.schema.json", "contracts/dialect-b.schema.json", "contracts/prototype-a.schema.json", "contracts/prototype-b.schema.json"],
    });
    const statuses = report.contractSemanticComparisons.map(({ status }) => status);
    assert.ok(statuses.includes("unsupported_schema_profile"));
    assert.equal(report.contractSemanticComparisons.find(({ leftPath }) => leftPath?.includes("dialect-a.schema.json"))?.status, "unsupported_schema_profile");
    assert.ok(statuses.includes("missing_identity"));
    assert.ok(statuses.includes("ambiguous_identity"));
    assert.ok(statuses.includes("unsupported_schema_profile"));
    assert.doesNotMatch(JSON.stringify(report), /never-return-this|schema-id|api-id|\$ref|\$defs/);
    assert.equal(report.entries.find(({ path: itemPath }) => itemPath.endsWith("ref-a.schema.json")).semanticAnalysisStatus, "unsupported_schema_features");
    assert.equal(report.entries.find(({ path: itemPath }) => itemPath.endsWith("openapi-a.schema.json")).semanticAnalysisStatus, "unsupported_format");
    assert.equal(Object.prototype.type, undefined);
  });
});

test("evidence report does not exceed its total byte parsing budget", () => {
  withRoot((root) => {
    const files = [];
    const body = `{"$schema":"x","payload":"${"x".repeat(262_080)}"}`;
    assert.ok(Buffer.byteLength(body) <= 256 * 1024);
    for (let index = 0; index < 33; index += 1) {
      const filePath = `contracts/${index}.schema.json`;
      const target = path.join(root, filePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, body);
      files.push(filePath);
    }
    const report = buildRepositoryEvidenceReport({ repositoryRoot: root, files });
    assert.ok(report.coverage.parsedBytes <= 8 * 1024 * 1024);
    assert.ok(report.entries.some(({ analysisStatus }) => analysisStatus === "total_byte_budget_exceeded"));
  });
});

test("evidence report rejects traversal inputs and caps candidate work", () => {
  withRoot((root) => {
    assert.throws(() => buildRepositoryEvidenceReport({ repositoryRoot: root, files: ["../outside/package.json"] }), /unsafe repository path/);
    const hostile = {};
    Object.defineProperty(hostile, "path", { get() { throw new Error("must not invoke accessors"); } });
    assert.throws(() => buildRepositoryEvidenceReport({ repositoryRoot: root, files: [hostile] }), /paths must be strings/);
    const candidates = Array.from({ length: 257 }, (_, index) => `contracts/${index}.schema.json`);
    const report = buildRepositoryEvidenceReport({ repositoryRoot: root, files: candidates });
    assert.equal(report.coverage.supportedPathCandidates, 257);
    assert.equal(report.coverage.analyzedPathCandidates, 256);
    assert.equal(report.coverage.skippedByFileLimit, 1);
  });
});

test("evidence report refuses symlinks in candidate paths", () => {
  withRoot((root) => {
    const target = path.join(root, "target.json");
    const contract = path.join(root, "contracts", "linked.schema.json");
    mkdirSync(path.dirname(contract), { recursive: true });
    writeFileSync(target, "{\"$schema\":\"opaque\"}");
    try {
      symlinkSync(target, contract, "file");
    } catch {
      return;
    }
    assert.throws(() => buildRepositoryEvidenceReport({ repositoryRoot: root, files: ["contracts/linked.schema.json"] }), /symlink paths/);
  });
});

test("evidence report refuses a symlink repository root", () => {
  withRoot((root) => {
    const link = `${root}-root-link`;
    try {
      symlinkSync(root, link, "junction");
    } catch {
      return;
    }
    try {
      assert.throws(() => buildRepositoryEvidenceReport({ repositoryRoot: link, files: [] }), /symlink or invalid repository root/);
    } finally {
      rmSync(link, { recursive: true, force: true });
    }
  });
});
