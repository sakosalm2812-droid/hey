const TAURI_PROTOCOL = "tauri:";
// Keep the renderer-side adapter aligned with native_capabilities(). Native
// execution remains unavailable until the signed permit verifier is wired.
const NATIVE_CAPABILITIES = Object.freeze([]);

export function isTauriRuntime() {
  return typeof window !== "undefined" && window.location.protocol === TAURI_PROTOCOL;
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
  return Object.freeze({
    platform: detectDesktopPlatform(),
    capabilities: NATIVE_CAPABILITIES,
    async execute({ capability, input = {} } = {}) {
      if (typeof capability !== "string" || !NATIVE_CAPABILITIES.includes(capability)) {
        return {
          success: false,
          verified: false,
          status: "unsupported",
          error: "Native commands are currently disabled on this device.",
        };
      }
      return invoke("native_execute", { capability, input });
    },
  });
}

export async function listTauriCapabilities() {
  if (!isTauriRuntime()) return [];
  return invoke("native_capabilities");
}
