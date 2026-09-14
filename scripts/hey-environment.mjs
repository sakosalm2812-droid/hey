import { spawnSync } from "node:child_process";
import process from "node:process";

function commandVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr || "").trim().split(/\r?\n/, 1)[0] || command;
}

const platform = process.platform === "win32"
  ? "windows"
  : process.platform === "darwin" ? "macos" : process.platform === "linux" ? "linux" : process.platform;
const tauriConfigured = Boolean(commandVersion(process.platform === "win32" ? "where" : "which", ["tauri"]));
const rust = commandVersion("rustc");
const cargo = commandVersion("cargo");
const msvc = platform === "windows" ? commandVersion("where", ["cl.exe"]) : "not applicable";
const nativeRuntime = process.env.TAURI_ENV_PLATFORM || "web/browser unless launched by Tauri";
const availableCapabilities = ["system.info", "browser.open_url", "app.open (Chrome)", "browser.navigate (Chrome)", "filesystem.read", "filesystem.write", "filesystem.create_directory", "filesystem.list", "filesystem.delete", "terminal.execute"];
const missingDependencies = [];
if (!rust) missingDependencies.push("Rust/rustc");
if (!cargo) missingDependencies.push("Cargo");
if (platform === "windows" && msvc === null) missingDependencies.push("MSVC and Windows SDK");

console.log(`HEY Environment

Platform: ${platform}
Runtime: ${nativeRuntime}
Tauri CLI: ${tauriConfigured ? "configured" : "not found"}
Rust: ${rust || "missing"}
Cargo: ${cargo || "missing"}
MSVC: ${msvc || "missing"}
Windows SDK: ${platform === "windows" ? (msvc ? "requires verification by Tauri" : "missing with MSVC") : "not applicable"}
Node: ${process.version}
Browser: web APIs are runtime-dependent
Native adapter: ${rust && cargo ? "Tauri bridge can be compiled" : "Tauri bridge configured, compilation blocked"}
Available capabilities: ${availableCapabilities.join(", ")}
Missing capabilities: non-Chrome application control, window/input control, screenshots, notifications, media
Missing dependencies: ${missingDependencies.length ? missingDependencies.join(", ") : "none detected"}`);
