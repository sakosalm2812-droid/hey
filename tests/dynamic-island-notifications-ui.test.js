import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getSafeNotificationActions, getSafeNotificationPath } from "../src/lib/notificationNavigation.js";

const source = () => readFile(new URL("../src/components/layout/DynamicIsland.jsx", import.meta.url), "utf8");

test("notification destinations allow bounded app routes and reject external or malformed targets", () => {
  assert.equal(getSafeNotificationPath("/chat?from=notice#latest"), "/chat?from=notice#latest");
  assert.equal(getSafeNotificationPath("/permissions"), "/permissions");
  for (const target of [
    "https://example.com/steal",
    "javascript:alert(1)",
    "//example.com/steal",
    "/\\example.com/steal",
    "/chat\n/permissions",
    "",
    " /chat",
    null,
    { toString: () => "/chat" },
    `/${"a".repeat(2048)}`,
  ]) {
    assert.equal(getSafeNotificationPath(target), null, `rejects ${String(target).slice(0, 80)}`);
  }
});

test("notification action snapshots are bounded and ignore hostile or malformed action data", () => {
  let getterCalls = 0;
  const accessorAction = {};
  Object.defineProperty(accessorAction, "label", { get() { getterCalls += 1; return "Open"; } });
  const accessorArray = [];
  Object.defineProperty(accessorArray, "0", { get() { getterCalls += 1; return { label: "Open" }; } });
  accessorArray.length = 1;

  const actions = getSafeNotificationActions([
    null,
    { label: "Go to chat", path: "/chat" },
    { label: "External", path: "https://example.com" },
  ]);
  assert.deepEqual(actions, [{ label: "Go to chat", path: "/chat" }]);
  assert.deepEqual(getSafeNotificationActions([{ label: "External", path: "https://example.com" }]), [{ label: "External", path: null }]);
  assert.equal(Object.isFrozen(actions), true);
  assert.equal(getSafeNotificationActions([accessorAction]).length, 0);
  assert.equal(getSafeNotificationActions(accessorArray).length, 0);
  assert.equal(getSafeNotificationActions({ length: 0 }).length, 0);
  assert.equal(getterCalls, 0);
});

test("notification cards expose separate keyboard actions without clickable generic containers", async () => {
  const ui = await source();
  const cardStart = ui.indexOf("<motion.article");
  const cardEnd = ui.indexOf("</motion.article>", cardStart);
  assert.ok(cardStart >= 0 && cardEnd > cardStart, "cards use article semantics");
  const card = ui.slice(cardStart, cardEnd);
  const openingTag = card.slice(0, card.indexOf(">"));
  assert.doesNotMatch(openingTag, /onClick=/);
  assert.match(ui, /getSafeNotificationActions\(item\.actions\)/);
  assert.match(card, /getSafeNotificationPath\(action\.path\)/);
  assert.match(card, /aria-label=\{`Open \$\{item\.title\}`\}/);
  assert.match(card, /aria-label=\{`Mark \$\{item\.title\} as read`\}/);
  assert.match(card, /aria-label=\{`Dismiss \$\{item\.title\}`\}/);
  assert.match(card, /onClick=\{\(\) => \{ markNotificationRead\(item\.id\); const path = getSafeNotificationPath\(action\.path\); if \(path\) navigate\(path\); \}\}/);
  assert.doesNotMatch(card, /stopPropagation/);
});
