import { createHash } from "node:crypto";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DRILL_DIRECTORY_PREFIX = "hey-local-backup-restore-drill-";
const MANIFEST_VERSION = 1;
const TEST_FAULTS = new Set(["corrupt", "missing", "traversal", "extra", "restore-conflict"]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSafeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.includes("\\") || relativePath.includes("\0") || relativePath.includes(":")) {
    throw new Error("manifest_invalid");
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..") || path.posix.isAbsolute(relativePath)) {
    throw new Error("manifest_invalid");
  }
  return segments;
}

async function listFiles(root) {
  const files = new Map();
  const rootMetadata = await lstat(root);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) throw new Error("unsupported_file_type");
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = path.join(directory, entry.name);
      const metadata = await lstat(absolutePath).catch((error) => {
        if (error.code === "ENOENT") throw new Error("payload_mismatch");
        throw error;
      });
      if (entry.isSymbolicLink()) throw new Error("unsupported_file_type");
      if (entry.isDirectory()) await visit(absolutePath, relativePath);
      else if (entry.isFile() && metadata.isFile()) files.set(relativePath, await readFile(absolutePath));
      else throw new Error("unsupported_file_type");
    }
  }
  await visit(root);
  return files;
}

function assertExactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

async function verifyBackupAndRestore(backupDirectory, restoreDirectory) {
  const backupEntries = await readdir(backupDirectory, { withFileTypes: true });
  if (backupEntries.length !== 2 || !backupEntries.some((entry) => entry.name === "manifest.json" && entry.isFile())
    || !backupEntries.some((entry) => entry.name === "payload" && entry.isDirectory())) {
    throw new Error("manifest_invalid");
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(backupDirectory, "manifest.json"), "utf8"));
  } catch {
    throw new Error("manifest_invalid");
  }
  if (!assertExactKeys(manifest, ["version", "entries"]) || manifest.version !== MANIFEST_VERSION || !Array.isArray(manifest.entries)) {
    throw new Error("manifest_invalid");
  }

  const manifestByPath = new Map();
  for (const entry of manifest.entries) {
    if (!assertExactKeys(entry, ["path", "size", "sha256"])) throw new Error("manifest_invalid");
    assertSafeRelativePath(entry.path);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256) || manifestByPath.has(entry.path)) {
      throw new Error("manifest_invalid");
    }
    manifestByPath.set(entry.path, entry);
  }

  const payloadFiles = await listFiles(path.join(backupDirectory, "payload"));
  if (payloadFiles.size !== manifestByPath.size) throw new Error("payload_mismatch");
  for (const [relativePath, entry] of manifestByPath) {
    const bytes = payloadFiles.get(relativePath);
    if (!bytes || bytes.byteLength !== entry.size || sha256(bytes) !== entry.sha256) throw new Error("integrity_mismatch");
  }

  // Verify the entire backup before writing the first restored file.
  for (const [relativePath, bytes] of payloadFiles) {
    const segments = assertSafeRelativePath(relativePath);
    const destination = path.join(restoreDirectory, ...segments);
    const resolvedRoot = path.resolve(restoreDirectory) + path.sep;
    if (!path.resolve(destination).startsWith(resolvedRoot)) throw new Error("manifest_invalid");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx" });
  }
}

async function createFixture(sourceDirectory) {
  const fixture = new Map([
    ["account/profile.json", Buffer.from('{"displayName":"Drill User","locale":"en"}\n')],
    ["account/preferences.json", Buffer.from('{"theme":"system","voicePreview":false}\n')],
    ["records/note.txt", Buffer.from("Synthetic recovery drill record.\n", "utf8")],
  ]);
  for (const [relativePath, bytes] of fixture) {
    const destination = path.join(sourceDirectory, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx" });
  }
  return fixture;
}

async function createBackup(sourceDirectory, backupDirectory) {
  await mkdir(path.join(backupDirectory, "payload"), { recursive: true });
  const sourceFiles = await listFiles(sourceDirectory);
  const entries = [];
  for (const [relativePath, bytes] of sourceFiles) {
    const destination = path.join(backupDirectory, "payload", ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx" });
    entries.push({ path: relativePath, size: bytes.byteLength, sha256: sha256(bytes) });
  }
  await writeFile(path.join(backupDirectory, "manifest.json"), JSON.stringify({ version: MANIFEST_VERSION, entries }, null, 2), { flag: "wx" });
  return sourceFiles;
}

async function applyTestFault(backupDirectory, restoreDirectory, fault) {
  if (fault === null || fault === undefined) return;
  if (!TEST_FAULTS.has(fault)) throw new TypeError("Unknown drill fault injection.");
  const manifestPath = path.join(backupDirectory, "manifest.json");
  const payloadPath = path.join(backupDirectory, "payload", "account", "profile.json");
  if (fault === "corrupt") {
    const bytes = await readFile(payloadPath);
    bytes[0] ^= 1;
    await writeFile(payloadPath, bytes);
  } else if (fault === "missing") {
    await rm(payloadPath);
  } else if (fault === "extra") {
    await writeFile(path.join(backupDirectory, "payload", "unlisted.txt"), "unexpected", { flag: "wx" });
  } else if (fault === "traversal") {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.entries[0].path = "../escaped.txt";
    await writeFile(manifestPath, JSON.stringify(manifest), { flag: "w" });
  } else if (fault === "restore-conflict") {
    const conflictPath = path.join(restoreDirectory, "account", "profile.json");
    await mkdir(path.dirname(conflictPath), { recursive: true });
    await writeFile(conflictPath, "pre-existing conflicting file", { flag: "wx" });
  }
}

async function countExactRestoredFiles(expectedFiles, restoreDirectory) {
  let restoredFiles;
  try {
    restoredFiles = await listFiles(restoreDirectory);
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    return null;
  }
  return [...expectedFiles].filter(([relativePath, bytes]) => restoredFiles.get(relativePath)?.equals(bytes)).length;
}

async function failedDrillResult(error, expectedFiles, restoreDirectory) {
  const restoredFileCount = await countExactRestoredFiles(expectedFiles, restoreDirectory);
  if (restoredFileCount === null) return { status: "failed", reason: "restore_state_unverifiable", restoredFileCount: null };
  if (restoredFileCount > 0) return { status: "failed", reason: "partial_restore_detected", restoredFileCount };
  const reason = ["manifest_invalid", "payload_mismatch", "integrity_mismatch", "unsupported_file_type"].includes(error.message)
    ? error.message
    : "drill_io_error";
  return { status: "failed", reason, restoredFileCount: 0 };
}

/**
 * Run a synthetic local backup/restore rehearsal in a newly-created OS temporary directory.
 * The testFault option exists only for deterministic adversarial tests; no caller-selected path
 * or application data is accepted by this harness.
 */
export async function runLocalBackupRestoreDrill({ testFault = null } = {}) {
  if (testFault !== null && !TEST_FAULTS.has(testFault)) throw new TypeError("Unknown drill fault injection.");
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), DRILL_DIRECTORY_PREFIX));
  const sourceDirectory = path.join(temporaryRoot, "source");
  const backupDirectory = path.join(temporaryRoot, "backup");
  const restoreDirectory = path.join(temporaryRoot, "restored");
  let result;
  try {
    const fixture = await createFixture(sourceDirectory);
    const sourceFiles = await createBackup(sourceDirectory, backupDirectory);
    await mkdir(restoreDirectory, { recursive: true });
    await applyTestFault(backupDirectory, restoreDirectory, testFault);
    try {
      await verifyBackupAndRestore(backupDirectory, restoreDirectory);
    } catch (error) {
      result = await failedDrillResult(error, sourceFiles, restoreDirectory);
    }

    if (!result) {
      const restoredFiles = await listFiles(restoreDirectory);
      const identical = sourceFiles.size === fixture.size && restoredFiles.size === sourceFiles.size
        && [...sourceFiles].every(([relativePath, bytes]) => restoredFiles.has(relativePath) && restoredFiles.get(relativePath).equals(bytes));
      result = identical
        ? {
          status: "passed",
          scope: "synthetic_local_files_only",
          fileCount: sourceFiles.size,
          restoredFileCount: restoredFiles.size,
          verifiedSha256: [...restoredFiles].map(([relativePath, bytes]) => ({ path: relativePath, sha256: sha256(bytes) })),
        }
        : { status: "failed", reason: "restore_verification_failed", restoredFileCount: await countExactRestoredFiles(sourceFiles, restoreDirectory) };
    }
  } catch (error) {
    result = await failedDrillResult(error, new Map(), restoreDirectory);
  }

  // This path is exclusively allocated by mkdtemp above; callers cannot choose it.
  try {
    await rm(temporaryRoot, { recursive: true, force: true });
    result.temporaryDataRemoved = true;
  } catch {
    result = { status: "failed", reason: "temporary_data_cleanup_failed", restoredFileCount: result.restoredFileCount ?? null, temporaryDataRemoved: false };
  }
  return result;
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = await runLocalBackupRestoreDrill();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "passed") process.exitCode = 1;
}
