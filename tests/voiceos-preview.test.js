import assert from "node:assert/strict";
import test from "node:test";
import { describeSafeComputerActionPreview } from "../src/core/voiceOSPreview.js";

function openUrlPreview(url) {
  return {
    type: "Command",
    status: "preview_required",
    requiresConfirmation: true,
    preview: { command: { kind: "open_url", url } },
  };
}

test("safe HTTP and HTTPS targets remain available as inert preview summaries", () => {
  const http = describeSafeComputerActionPreview(openUrlPreview("http://example.com/path?q=one"));
  assert.deepEqual(http, {
    capability: "browser.open_url",
    label: "Open website",
    target: "http://example.com/path?q=one",
    risk: "Medium",
  });

  const https = describeSafeComputerActionPreview(openUrlPreview("HTTPS://Example.COM:443/path"));
  assert.deepEqual(https, {
    capability: "browser.open_url",
    label: "Open website",
    target: "https://example.com/path",
    risk: "Medium",
  });
  assert.deepEqual(Object.keys(https).sort(), ["capability", "label", "risk", "target"]);

  const ipv6 = describeSafeComputerActionPreview(openUrlPreview("https://[2001:db8::1]:8443/status"));
  assert.equal(ipv6?.target, "https://[2001:db8::1]:8443/status");
});

test("URL preview refuses username and password credentials in the authority", () => {
  for (const url of [
    "https://user:secret@example.com/private",
    "https://user@example.com/private",
    "https://:secret@example.com/private",
    "https://@example.com/private",
    "https://trusted.example@attacker.example/private",
    "http://user%40name:secret@example.com/",
  ]) {
    assert.equal(describeSafeComputerActionPreview(openUrlPreview(url)), null, url);
  }
});

test("malformed URL authorities fail closed while @ in the path remains ordinary path data", () => {
  for (const url of [
    "https:///missing-host",
    "http://:80/path",
    "https://example.com:99999/path",
    "https://example.com:/path",
    "https://[2001:db8::1]:/path",
    "https://[2001:db8::1/path",
    "https://example.com\\@attacker.example/",
    "https://example.com :443/path",
    "https://example.com%2f.attacker.example/path",
  ]) {
    assert.equal(describeSafeComputerActionPreview(openUrlPreview(url)), null, url);
  }

  const pathTarget = describeSafeComputerActionPreview(openUrlPreview("https://example.com/path/@not-a-credential"));
  assert.equal(pathTarget?.target, "https://example.com/path/@not-a-credential");
});

test("hostile URL field accessors are rejected without invocation", () => {
  let getterCalls = 0;
  const command = { kind: "open_url" };
  Object.defineProperty(command, "url", {
    enumerable: true,
    get() { getterCalls += 1; throw new Error("URL getter must not run"); },
  });
  assert.equal(describeSafeComputerActionPreview({
    type: "Command",
    status: "preview_required",
    requiresConfirmation: true,
    preview: { command },
  }), null);
  assert.equal(getterCalls, 0);
});
