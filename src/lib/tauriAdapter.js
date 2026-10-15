const TAURI_PROTOCOL = "tauri:";

export function isTauriRuntime() {
  if (typeof window === "undefined" || !window.location) return false;
  const { protocol, hostname } = window.location;
  if ((protocol === TAURI_PROTOCOL && hostname === "localhost")
    || ((protocol === "http:" || protocol === "https:") && hostname === "tauri.localhost")) return true;
  return Boolean(window.__TAURI_INTERNALS__);
}

function detectDesktopPlatform() {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  if (userAgent.includes("mac")) return "macos";
  if (userAgent.includes("linux")) return "linux";
  return "windows";
}

async function invoke(command, payload) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, payload);
}

export function createTauriAdapter() {
  if (!isTauriRuntime()) return null;
  return {
    platform: detectDesktopPlatform(),
    capabilities: [
      "system.info",
      "browser.open_url",
      "app.open",
      "browser.navigate",
      "filesystem.read",
      "filesystem.write",
      "filesystem.create_directory",
      "filesystem.list",
      "filesystem.delete",
      "terminal.execute",
    ],
    async execute({ capability, input = {} }) {
      return invoke("native_execute", { capability, input });
    },
  };
}

export async function listTauriCapabilities() {
  if (!isTauriRuntime()) return [];
  return invoke("native_capabilities");
}
