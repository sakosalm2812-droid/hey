const DISMISSED_KEY = "hey.pwa-install-dismissed-at";
const DISMISSAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function wasInstallRecentlyDismissed(storage, now = Date.now()) {
  try {
    const dismissedAt = Number(storage?.getItem(DISMISSED_KEY));
    return Number.isFinite(dismissedAt) && dismissedAt > 0 && now - dismissedAt < DISMISSAL_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function recordInstallDismissal(storage, now = Date.now()) {
  try {
    storage?.setItem(DISMISSED_KEY, String(now));
  } catch {
    // The explicit install control still works when browser storage is unavailable.
  }
}

export function getInstallInstructions({ platform = "", userAgent = "" } = {}) {
  const platformText = `${platform} ${userAgent}`.toLowerCase();
  if (/iphone|ipad|ipod/.test(platformText)) {
    return { title: "Add HEY to your Home Screen", steps: ["Open HEY in Safari.", "Tap Share.", "Choose Add to Home Screen, then confirm."] };
  }
  if (/android/.test(platformText)) {
    return { title: "Install HEY from your browser menu", steps: ["Open HEY in Chrome.", "Open the browser menu.", "Choose Install app or Add to Home screen."] };
  }
  if (/win32|win64|windows|mac|linux|cros/.test(platformText)) {
    return { title: "Install HEY from your browser", steps: ["Open HEY in Chrome or Edge.", "Open the address-bar install icon or browser menu.", "Choose Install HEY and confirm."] };
  }
  return { title: "Use your browser's install option", steps: ["Open the browser menu while viewing HEY.", "Look for Install app or Add to Home Screen."] };
}
