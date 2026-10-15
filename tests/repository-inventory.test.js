import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { discoverRepositoryInventory, parseRepositoryGitOutput, planRepositoryInventory } from "../scripts/repository-inventory.mjs";

globalThis.crypto ??= webcrypto;

async function withRepository(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "hey-inventory-"));
  try {
    const git = (args) => execFileSync("git", args, { cwd: root, stdio: "ignore", windowsHide: true });
    git(["init", "--quiet"]);
    git(["config", "user.name", "Inventory Test"]);
    git(["config", "user.email", "inventory@example.invalid"]);
    writeFileSync(path.join(root, "tracked.txt"), "original bytes\n");
    git(["add", "tracked.txt"]);
    git(["commit", "--quiet", "-m", "fixture"]);
    await run(root, git);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("repository discovery maps tracked, dirty, and untracked names to a dry-run plan without changing state", async () => {
  await withRepository(async (root) => {
    writeFileSync(path.join(root, "tracked.txt"), "changed bytes\n");
    writeFileSync(path.join(root, "untracked.txt"), "untracked bytes\n");
    const before = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root });
    const original = readFileSync(path.join(root, "tracked.txt"));
    const { inventory } = discoverRepositoryInventory({ cwd: root });
    const result = await planRepositoryInventory({ cwd: root });
    const after = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root });

    assert.deepEqual(after, before);
    assert.deepEqual(readFileSync(path.join(root, "tracked.txt")), original);
    assert.deepEqual(inventory.repository.map(({ name }) => name), ["tracked.txt", "untracked.txt"]);
    assert.deepEqual(inventory.repositoryState, { dirty: true, untracked: true });
    assert.deepEqual(result.repositoryState, { dirty: true, untracked: true, preservationRequired: true, stateKnown: true });
    assert.equal(result.mode, "dry_run");
    assert.equal(result.inventoryCounts.repository, 2);
    assert.equal(result.inventoryCounts.packages, 0);
    assert.ok(result.dispositions.every(({ disposition }) => disposition === "Preserve"));
  });
});

test("repository discovery handles dash-prefixed names while rejecting control-character filenames", async () => {
  await withRepository((root) => {
    writeFileSync(path.join(root, "-hostile-name"), "x");
    assert.ok(discoverRepositoryInventory({ cwd: root }).inventory.repository.some(({ name }) => name === "-hostile-name"));
    if (process.platform !== "win32") {
      writeFileSync(path.join(root, "line\nbreak"), "x");
      assert.throws(() => discoverRepositoryInventory({ cwd: root }), /unsafe repository path/);
    }
  });
});

test("Git output parsing rejects malformed records and traversal paths", () => {
  assert.throws(() => parseRepositoryGitOutput({ trackedOutput: Buffer.from("broken\0"), statusOutput: Buffer.alloc(0) }), /malformed tracked-file output/);
  assert.throws(() => parseRepositoryGitOutput({ trackedOutput: Buffer.alloc(0), statusOutput: Buffer.from("?? missing-terminator") }), /malformed working-tree status/);
  const trackedTraversal = Buffer.from(`100644 ${"0".repeat(40)} 0\t../outside\0`);
  assert.throws(() => parseRepositoryGitOutput({ trackedOutput: trackedTraversal, statusOutput: Buffer.alloc(0) }), /unsafe repository path/);
  assert.throws(() => parseRepositoryGitOutput({ trackedOutput: Buffer.alloc(0), statusOutput: Buffer.from("invalid\0") }), /malformed working-tree status/);
});

test("repository discovery fails closed outside Git and when Git is unavailable", async () => {
  const outside = mkdtempSync(path.join(os.tmpdir(), "hey-outside-"));
  try {
    assert.throws(() => discoverRepositoryInventory({ cwd: outside }), /could not safely query git/);
    await withRepository((root) => {
      assert.throws(() => discoverRepositoryInventory({ cwd: root, gitExecutable: "missing-git-inventory-test-executable" }), /could not safely query git/);
    });
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("repository discovery refuses symlink paths without reading their targets", async () => {
  await withRepository((root) => {
    const target = path.join(root, "outside-target.txt");
    const link = path.join(root, "linked.txt");
    writeFileSync(target, "target stays opaque\n");
    try {
      if (process.platform === "win32") execFileSync("cmd.exe", ["/d", "/s", "/c", `mklink "${link}" "${target}"`], { cwd: root, stdio: "ignore", windowsHide: true });
      else execFileSync("ln", ["-s", target, link], { cwd: root, stdio: "ignore" });
    } catch {
      return;
    }
    assert.throws(() => discoverRepositoryInventory({ cwd: root }), /symlink paths/);
    assert.equal(readFileSync(target, "utf8"), "target stays opaque\n");
  });
});
