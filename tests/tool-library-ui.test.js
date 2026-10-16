import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [appSource, layoutSource, pageSource] = await Promise.all([
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/layout/AppLayout.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/ToolLibraryPage.jsx", import.meta.url), "utf8"),
]);

test("Tool Library is reachable through the protected app route and primary navigation", () => {
  assert.match(appSource, /path="\/tools"\s+element={<ProtectedLayout><ToolLibraryPage \/><\/ProtectedLayout>}/);
  assert.match(layoutSource, /label: "Tools", path: "\/tools"/);
});

test("Tool Library renders only canonical catalog descriptors and communicates policy states", () => {
  assert.match(pageSource, /HEY\.tools\.catalog\(\{ platform: "web" \}\)/);
  assert.doesNotMatch(pageSource, /HEY\.tools\.all\(/);
  assert.match(pageSource, /Permission required/);
  assert.match(pageSource, /Unsupported here/);
  assert.match(pageSource, /Restricted/);
  assert.match(pageSource, /role="alert"/);
  assert.match(pageSource, /role="status"/);
  assert.match(pageSource, /No tools registered yet/);
  assert.match(pageSource, /role="note"/);
  assert.doesNotMatch(pageSource, /\b(?:Start|Stop|Install|Uninstall)\b/);
});

test("Tool Library exposes labeled search and stable headings for assistive technology", () => {
  assert.match(pageSource, /aria-labelledby="tool-library-title"/);
  assert.match(pageSource, /<h1 id="tool-library-title">Tools<\/h1>/);
  assert.match(pageSource, /Search tools, permissions, and capabilities/);
  assert.match(pageSource, /aria-live="polite"/);
});

test("Tool Library runs through the canonical plan API and offers only explicitly retryable recovery", () => {
  assert.match(pageSource, /HEY\.tools\.plan\(/);
  assert.match(pageSource, /HEY\.tools\.executePlan\(/);
  assert.match(pageSource, /HEY\.tools\.lifecycleActivity\(/);
  assert.match(pageSource, /HEY\.permissions\.request\(/);
  assert.match(pageSource, /HEY\.permissions\.grant\(/);
  assert.match(pageSource, /stepReceipt\.metadata\?\.retryable === true/);
  assert.match(pageSource, /Retry this run/);
  assert.match(pageSource, /Your signed-in account changed while this tool was running/);
  assert.match(pageSource, /subscribeAccountScope/);
  assert.match(pageSource, /controllerRef\.current !== controller/);
  assert.match(pageSource, /isToolLibraryRecordVisible\(receiptState, accountId, getAccountScope\(\)\)/);
});
