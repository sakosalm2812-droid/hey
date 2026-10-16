import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rustSource = (await readFile(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8")).replaceAll("\r\n", "\n");

test("native IPC denies before dispatch when no native authorization verifier is configured", () => {
  const authorizationStart = rustSource.indexOf("fn native_authorization_configured() -> bool {");
  assert.notEqual(authorizationStart, -1);
  assert.match(rustSource.slice(authorizationStart, authorizationStart + 120), /\{\s*false\s*\}/);

  const executeStart = rustSource.indexOf("fn native_execute(capability: String, input: Value) -> NativeResult {");
  const executeEnd = rustSource.indexOf("\n}\n", executeStart);
  assert.notEqual(executeStart, -1);
  assert.notEqual(executeEnd, -1);
  const executeBody = rustSource.slice(executeStart, executeEnd);
  const denyIndex = executeBody.indexOf("if !native_authorization_configured()");
  const dispatchIndex = executeBody.indexOf("match capability.as_str()");
  assert.ok(denyIndex > -1 && denyIndex < dispatchIndex, "authorization denial must precede every capability dispatch");
  assert.match(executeBody.slice(denyIndex, dispatchIndex), /return failure\(&capability, "Native command authorization is not configured\. Local commands are disabled\."\)/);
});

test("native capability discovery does not advertise unauthenticated execution", () => {
  const capabilitiesStart = rustSource.indexOf("fn native_capabilities() -> Value {");
  const capabilitiesEnd = rustSource.indexOf("\n}", capabilitiesStart);
  assert.notEqual(capabilitiesStart, -1);
  assert.match(rustSource.slice(capabilitiesStart, capabilitiesEnd), /serde_json::json!\(\[\]\)/);
});

test("Rust adversarial coverage includes direct IPC, replay, and scope mismatch cases", () => {
  assert.match(rustSource, /fn direct_ipc_calls_fail_closed_for_every_privileged_capability/);
  assert.match(rustSource, /fn forged_replayed_expired_and_scope_mismatched_renderer_permits_stay_denied/);
  assert.match(rustSource, /fn native_capability_discovery_does_not_advertise_unverified_execution/);
});
