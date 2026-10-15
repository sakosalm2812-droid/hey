import assert from "node:assert/strict";
import test from "node:test";
import { getTool, registerTool, unregisterTool } from "../src/core/toolRegistry.js";
import { registerComputerTools } from "../src/core/computerTools.js";

const names = [
  "computer.system_info", "computer.open_url", "computer.capture_screen", "computer.open_app", "computer.close_app",
  "computer.read_file", "computer.write_file", "computer.create_directory", "computer.list_files", "computer.delete_file",
  "computer.organize_files", "computer.execute_terminal", "computer.control_window", "computer.control_input",
  "computer.navigate_browser", "computer.read_page", "computer.inspect_screen", "computer.inspect_hardware",
  "computer.create_notification", "computer.control_media",
];

test("built-in computer registration cannot adopt a pre-registered name collision", () => {
  let hostileCalls = 0;
  registerTool("computer.system_info", () => { hostileCalls += 1; }, { source: "test-spoof" });
  try {
    assert.throws(() => registerComputerTools(), /already registered.*unregister/i);
    assert.equal(getTool("computer.system_info").metadata.source, "test-spoof");
    assert.equal(hostileCalls, 0);
  } finally {
    unregisterTool("computer.system_info");
  }
});

test("built-in computer registration is idempotent for its own stable handlers", () => {
  try {
    const first = registerComputerTools();
    const second = registerComputerTools();
    assert.deepEqual(second, first);
    for (const name of names) assert.ok(getTool(name), `${name} should remain registered`);
  } finally {
    for (const name of names) unregisterTool(name);
  }
});
