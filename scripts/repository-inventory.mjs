import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planIntegrationMigration } from "../src/core/integrationMigrationPlanner.js";
import { buildRepositoryEvidenceReport } from "./repository-evidence.mjs";

const MAX_REPOSITORY_FILES = 20_000;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function git(args, cwd, gitExecutable) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  try {
    return execFileSync(gitExecutable, ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", ...args], {
      cwd,
      env,
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
  } catch {
    throw new Error("Repository inventory could not safely query git.");
  }
}

function decode(buffer, label) {
  try {
    return UTF8.decode(buffer);
  } catch {
    throw new Error(`Repository inventory received malformed UTF-8 in ${label}.`);
  }
}

function nulRecords(buffer, label) {
  if (!Buffer.isBuffer(buffer)) throw new Error(`Repository inventory received malformed ${label}.`);
  if (buffer.length === 0) return [];
  if (buffer[buffer.length - 1] !== 0) throw new Error(`Repository inventory received malformed ${label}.`);
  const records = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index === start) throw new Error(`Repository inventory received malformed ${label}.`);
    records.push(buffer.subarray(start, index));
    start = index + 1;
  }
  return records;
}

function safeRepositoryPath(value) {
  if (!value || value.length > 4096 || value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:/.test(value) || value.includes("\\") || value.includes(":") || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Repository inventory encountered an unsafe repository path.");
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Repository inventory encountered an unsafe repository path.");
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized.startsWith("../")) throw new Error("Repository inventory encountered an unsafe repository path.");
  return value;
}

function assertNoSymlink(root, relativePath, allowMissingLeaf = false) {
  let current = root;
  const segments = relativePath.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (allowMissingLeaf && index === segments.length - 1 && error.code === "ENOENT") return;
      throw new Error("Repository inventory could not verify repository paths safely.");
    }
    if (stat.isSymbolicLink()) throw new Error("Repository inventory refuses symlink paths.");
  }
}

function parseTracked(records) {
  const tracked = new Map();
  for (const record of records) {
    const tab = record.indexOf(9);
    if (tab < 0) throw new Error("Repository inventory received malformed tracked-file output.");
    const metadata = decode(record.subarray(0, tab), "tracked-file output");
    const match = /^(100644|100755|120000|160000) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])$/.exec(metadata);
    if (!match) throw new Error("Repository inventory received malformed tracked-file output.");
    const filePath = safeRepositoryPath(decode(record.subarray(tab + 1), "tracked-file path"));
    if (match[1] === "120000") throw new Error("Repository inventory refuses tracked symlink paths.");
    if (tracked.has(filePath)) throw new Error("Repository inventory refuses ambiguous index entries.");
    tracked.set(filePath, match[1]);
  }
  return tracked;
}

function parseStatus(records) {
  const status = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 4 || record[2] !== 32) throw new Error("Repository inventory received malformed working-tree status output.");
    const code = decode(record.subarray(0, 2), "working-tree status");
    if (!/^(?:\?\?|[ MADRCTU]{2})$/.test(code) || code === "  ") throw new Error("Repository inventory received malformed working-tree status output.");
    const filePath = safeRepositoryPath(decode(record.subarray(3), "working-tree path"));
    if (status.has(filePath)) throw new Error("Repository inventory refuses ambiguous working-tree status.");
    status.set(filePath, code);
    if (code.includes("R") || code.includes("C")) {
      index += 1;
      if (index >= records.length) throw new Error("Repository inventory received malformed rename status output.");
      safeRepositoryPath(decode(records[index], "rename source path"));
    }
  }
  return status;
}

export function parseRepositoryGitOutput({ trackedOutput, statusOutput } = {}) {
  const tracked = parseTracked(nulRecords(trackedOutput, "tracked-file list"));
  const status = parseStatus(nulRecords(statusOutput, "working-tree status"));
  for (const [filePath, code] of status) {
    if (code !== "??" && !tracked.has(filePath)) throw new Error("Repository inventory found a working-tree path absent from the Git index.");
    if (code === "??") tracked.set(filePath, "untracked");
  }
  return { tracked, status };
}

/**
 * Discover file names and Git state only. This function never reads file contents,
 * writes repository data, invokes migration commands, or treats repository text as instructions.
 */
export function discoverRepositoryInventory({ cwd = process.cwd(), gitExecutable = "git" } = {}) {
  const requestedDirectory = path.resolve(cwd);
  let realRequestedDirectory;
  try {
    realRequestedDirectory = realpathSync(requestedDirectory);
  } catch {
    throw new Error("Repository inventory requires an existing repository directory.");
  }
  if (realRequestedDirectory !== requestedDirectory) throw new Error("Repository inventory refuses a symlink working directory.");

  const rootOutput = git(["rev-parse", "--show-toplevel"], requestedDirectory, gitExecutable);
  const rootText = decode(rootOutput, "repository root").replace(/\r?\n$/, "");
  if (!rootText || rootText.includes("\n") || rootText.includes("\r")) throw new Error("Repository inventory received malformed repository root output.");
  const repositoryRoot = path.resolve(rootText);
  let realRepositoryRoot;
  try {
    realRepositoryRoot = realpathSync(repositoryRoot);
  } catch {
    throw new Error("Repository inventory could not verify the repository root.");
  }
  if (repositoryRoot !== realRepositoryRoot) throw new Error("Repository inventory refuses a symlink repository root.");
  const relativeDirectory = path.relative(repositoryRoot, requestedDirectory);
  if (relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory)) throw new Error("Repository inventory refuses paths outside the repository.");

  const inside = decode(git(["rev-parse", "--is-inside-work-tree"], requestedDirectory, gitExecutable), "worktree status").trim();
  if (inside !== "true") throw new Error("Repository inventory requires a Git working tree.");
  const { tracked, status } = parseRepositoryGitOutput({
    trackedOutput: git(["ls-files", "--stage", "-z"], repositoryRoot, gitExecutable),
    statusOutput: git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=no"], repositoryRoot, gitExecutable),
  });
  if (tracked.size > MAX_REPOSITORY_FILES) throw new Error("Repository inventory exceeds the safe file-count limit.");

  for (const [filePath, mode] of tracked) {
    if (mode === "160000") {
      assertNoSymlink(repositoryRoot, filePath, true);
      continue;
    }
    assertNoSymlink(repositoryRoot, filePath, true);
  }
  const dirty = [...status.values()].some((code) => code !== "??");
  const untracked = [...status.values()].some((code) => code === "??");
  const repository = [...tracked.keys()].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map((filePath, index) => ({
    id: `repository-file-${index + 1}`,
    kind: "repository_file",
    name: filePath,
  }));

  return {
    repositoryRoot,
    status,
    inventory: {
      repository,
      packages: [],
      contracts: [],
      migrations: [],
      manifests: [],
      dependencies: [],
      repositoryState: { dirty, untracked },
    },
  };
}

export async function planRepositoryInventory(options) {
  const discovered = discoverRepositoryInventory(options);
  const plan = await planIntegrationMigration({ inventory: discovered.inventory });
  const evidence = buildRepositoryEvidenceReport({
    repositoryRoot: discovered.repositoryRoot,
    files: discovered.inventory.repository.map(({ name }) => name),
    status: discovered.status,
  });
  return { ...plan, repositoryRoot: discovered.repositoryRoot, evidence };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  try {
    const requestedPath = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
    if (process.argv.length > 3) throw new Error("Usage: node scripts/repository-inventory.mjs [repository-directory]");
    const plan = await planRepositoryInventory({ cwd: requestedPath });
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Repository inventory failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
