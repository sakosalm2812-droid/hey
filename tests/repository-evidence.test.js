import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
