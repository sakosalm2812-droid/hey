import assert from "node:assert/strict";
import test from "node:test";
import { resolveRecentToolEntry } from "../src/lib/toolLibraryRecentEntry.js";

const ACCOUNT = "tool-recent-account";
const TOOL = "computer.open_url";

test("recent entries reopen only a tool that remains in the canonical catalog", () => {
  const recent = [{ name: TOOL, usedAt: "2026-10-17T10:00:00.000Z" }];
  const catalog = [{ name: TOOL, status: "supported" }];
  assert.deepEqual(resolveRecentToolEntry({
    name: TOOL,
    accountId: ACCOUNT,
    activeScope: `account:${ACCOUNT}`,
    recent,
    catalog,
  }), { status: "ready", name: TOOL });
  assert.equal(resolveRecentToolEntry({
    name: "computer.capture_screen",
    accountId: ACCOUNT,
    activeScope: `account:${ACCOUNT}`,
    recent,
    catalog,
  }).status, "not_recent");
});

test("account changes and stale catalog entries cannot open a previous recent tool", () => {
  const recent = [{ name: TOOL }];
  const wrongAccount = resolveRecentToolEntry({
    name: TOOL,
    accountId: "other-account",
    activeScope: `account:${ACCOUNT}`,
    recent,
    catalog: [{ name: TOOL }],
  });
  assert.equal(wrongAccount.status, "account_required");

  const staleCatalog = resolveRecentToolEntry({
    name: TOOL,
    accountId: ACCOUNT,
    activeScope: `account:${ACCOUNT}`,
    recent,
    catalog: [{ name: "computer.capture_screen" }],
  });
  assert.equal(staleCatalog.status, "stale_entry");
  assert.equal(Object.hasOwn(staleCatalog, "name"), false);
});

test("hostile getters, revoked proxies, and oversized recent data fail closed", () => {
  let getterCalls = 0;
  const hostileEntry = {};
  Object.defineProperty(hostileEntry, "name", { get() { getterCalls += 1; throw new Error("must not run"); } });
  assert.equal(resolveRecentToolEntry({
    name: TOOL,
    accountId: ACCOUNT,
    activeScope: `account:${ACCOUNT}`,
    recent: [hostileEntry],
    catalog: [{ name: TOOL }],
  }).status, "not_recent");
  assert.equal(getterCalls, 0);

  const revoked = Proxy.revocable([], {});
  revoked.revoke();
  assert.equal(resolveRecentToolEntry({
    name: TOOL,
    accountId: ACCOUNT,
    activeScope: `account:${ACCOUNT}`,
    recent: revoked.proxy,
    catalog: [{ name: TOOL }],
  }).status, "invalid_entry");
  assert.equal(resolveRecentToolEntry({
    name: TOOL,
    accountId: ACCOUNT,
    activeScope: `account:${ACCOUNT}`,
    recent: Array(31).fill({ name: TOOL }),
    catalog: [{ name: TOOL }],
  }).status, "invalid_entry");
});
