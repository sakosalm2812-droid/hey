import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { getInstallInstructions, recordInstallDismissal, wasInstallRecentlyDismissed } from "../core/pwaInstall.js";
import "./PwaInstall.css";

function isStandalone() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone);
}

function dismissalStorage() {
  try { return window.localStorage; } catch { return null; }
}

export default function PwaInstall({ compact = false }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showInstructions, setShowInstructions] = useState(false);
  const [message, setMessage] = useState("");
  const instructions = getInstallInstructions({ platform: navigator.userAgentData?.platform || navigator.platform || "", userAgent: navigator.userAgent || "" });

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      if (isStandalone() || wasInstallRecentlyDismissed(dismissalStorage())) return;
      setInstallPrompt(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("HEY is installed on this device.");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setShowInstructions((open) => !open);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice?.outcome === "accepted") setMessage("HEY is being installed.");
      else {
        recordInstallDismissal(dismissalStorage());
        setMessage("Install dismissed. You can try again from Download HEY later.");
      }
    } catch {
      setInstallPrompt(null);
      setShowInstructions(true);
      setMessage("Your browser could not open the install prompt. Use these browser steps instead.");
    }
  }

  if (installed) return compact ? null : <p className="hey-pwa-status" role="status">HEY is installed as an app on this device.</p>;

  return (
    <div className={`hey-pwa-install${compact ? " hey-pwa-install-compact" : ""}`}>
      <button className="hey-pwa-install-button" type="button" onClick={install}>
        <Download size={compact ? 15 : 18} aria-hidden="true" /> Install HEY
      </button>
      {!compact && <span className="hey-pwa-platform-label">Web app · native installers shown below</span>}
      {message && <p className="hey-pwa-status" role="status">{message}</p>}
      {showInstructions && (
        <section className="hey-pwa-instructions" aria-label="Manual HEY installation steps">
          <h3>{instructions.title}</h3>
          <ol>{instructions.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          <p>HEY's web app can be installed where your browser supports it. Native desktop and mobile installers are separate and are not offered here unless marked available on the Download page.</p>
        </section>
      )}
    </div>
  );
}
