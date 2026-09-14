import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springs, press } from "./lib/heyMotion";
import { buzz, confirmSound, errorSound } from "./lib/heyFeedback";
import Sidebar from "./Sidebar";
import { useLongPress } from "./hooks/useLongPress.js";
import { createBrowserOSAdapter } from "./core/osAdapter.js";
import {
  Camera,
  MapPin,
  Clipboard,
  Bell,
  Share2,
  Sun,
  Vibrate,
  Battery,
  Wifi,
  Monitor,
  MonitorUp,
  Phone,
  RotateCw,
  ShieldCheck,
  LockKeyhole,
  LockOpen,
  CheckCircle2,
  XCircle,
  Sparkles,
  Cpu,
  Eye,
  Upload,
  Radio,
  MoveRight,
  KeyRound,
  Inbox,
} from "lucide-react";
import { understandImage } from "./core/visionEngine.js";
import { createHeyVisionProvider, fileToDataUrl } from "./lib/heyVision.js";
import {
  getDeviceId,
  getDeviceName,
  renameDevice,
  listPeers,
  requestHandoff,
  getHandoffBundle,
  clearHandoffBundle,
  acceptHandoff,
  producePairCode,
  getPairCode,
} from "./core/deviceFabric.js";

const os = createBrowserOSAdapter();

const CAPABILITIES = [
  {
    id: "camera",
    title: "Camera",
    description: "Capture a still frame from your camera (reads no video stream).",
    icon: Camera,
    accent: "coral",
    action: async () => os.captureCamera(),
  },
  {
    id: "location",
    title: "Location",
    description: "Read your current coordinates with your permission.",
    icon: MapPin,
    accent: "green",
    action: async () => os.getGeolocation(),
  },
  {
    id: "clipboard",
    title: "Clipboard",
    description: "Read and write text from your clipboard.",
    icon: Clipboard,
    accent: "gold",
    action: async () => {
      const read = await os.readClipboard();
      if (read.success) return read;
      return read;
    },
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Send a notification through the browser.",
    icon: Bell,
    accent: "lavender",
    action: async () => os.sendNotification({ title: "HEY", body: "This is HEY. Notifications are working." }),
  },
  {
    id: "share",
    title: "Share",
    description: "Share text or a link using the system share sheet.",
    icon: Share2,
    accent: "coral",
    action: async () => os.shareContent({ title: "HEY", text: "Tell me what you seek. I'll help you make it so.", url: window.location.href }),
  },
  {
    id: "screenshot",
    title: "Screen Share",
    description: "Capture the current display (shows your picker).",
    icon: Monitor,
    accent: "gold",
    action: async () => os.captureScreen(),
  },
  {
    id: "wakelock",
    title: "Wake Lock",
    description: "Keep the screen awake while you work.",
    icon: Sun,
    accent: "gold",
    action: async () => {
      const active = await os.requestWakeLock();
      if (active.success) {
        return { success: true, title: "Screen will stay awake", source: "wake_lock" };
      }
      return active;
    },
  },
  {
    id: "vibrate",
    title: "Vibration",
    description: "A short haptic pattern (mobile only).",
    icon: Vibrate,
    accent: "lavender",
    action: async () => os.vibrate({ pattern: [40, 40, 80] }),
  },
  {
    id: "battery",
    title: "Battery",
    description: "Read your device battery level and charging state.",
    icon: Battery,
    accent: "green",
    action: async () => os.getBattery(),
  },
  {
    id: "network",
    title: "Network",
    description: "Read effective connection type, speed, and latency.",
    icon: Wifi,
    accent: "green",
    action: async () => os.getNetworkInfo(),
  },
  {
    id: "system",
    title: "Device Info",
    description: "Read system, screen, and CPU details.",
    icon: Cpu,
    accent: "lavender",
    action: async () => os.getSystemInfo(),
  },
  {
    id: "fullscreen",
    title: "Fullscreen",
    description: "Enter and exit fullscreen for an immersive view.",
    icon: MonitorUp,
    accent: "coral",
    action: async () => {
      if (document.fullscreenElement) {
        return os.exitFullscreen();
      }
      return os.requestFullscreen();
    },
  },
];

const ACCENTS = {
  coral: "var(--coral)",
  green: "var(--green-accent)",
  gold: "var(--gold)",
  lavender: "var(--lavender)",
};

function formatResult(result) {
  if (!result) return null;
  if (result.success) {
    const relevant = ["latitude", "longitude", "accuracy", "text", "effectiveType", "downlink", "rtt", "level", "charging", "dataUrl", "screen", "online", "battery", "connection", "source", "userAgent", "width", "height"];
    const parts = Object.entries(result)
      .filter(([key, value]) => relevant.includes(key) && value !== undefined && value !== null)
      .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
    return parts.join("  ·  ") || "Success";
  }
  return result.error || "Something went wrong.";
}

function ResultBadge({ result }) {
  if (!result) return null;
  const ok = result.success;
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-2xl p-4 text-sm"
      style={{
        background: ok ? "rgba(124,184,124,.08)" : "rgba(255,122,138,.08)",
        color: ok ? "var(--green-accent)" : "var(--coral)",
        lineHeight: 1.6,
      }}
    >
      <div className="flex items-start gap-2">
        <Icon size={16} className="mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">{ok ? "Available" : "Unavailable"}</div>
          <div className="text-xs mt-1" style={{ opacity: 0.85 }}>{formatResult(result)}</div>
        </div>
      </div>
    </motion.div>
  );
}

export default function DeviceCenterPage() {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(null);
  const [visionImage, setVisionImage] = useState("");
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionResult, setVisionResult] = useState(null);
  const filePickerRef = useRef(null);

  const [deviceName, setDeviceName] = useState(() => getDeviceName());
  const [deviceId] = useState(() => getDeviceId());
  const [peers, setPeers] = useState([]);
  const [fabricSupported, setFabricSupported] = useState(true);
  const [pairCode, setPairCode] = useState(() => getPairCode()?.code || "");
  const [handoffBundle, setHandoffBundle] = useState(null);
  const [fabricMessage, setFabricMessage] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setPeers(listPeers());
      setHandoffBundle(getHandoffBundle());
      setFabricSupported(typeof BroadcastChannel !== "undefined");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function handleRename(event) {
    event.preventDefault();
    const next = renameDevice(deviceName);
    if (next) {
      setDeviceName(next);
      confirmSound();
      setFabricMessage("Device name updated. Other tabs will see the new name on the next heartbeat.");
    }
  }

  function handleRequestHandoff() {
    const result = requestHandoff({
      route: window.location.pathname,
      note: "Pick up where you left off on this device.",
    });
    if (result.success) {
      confirmSound();
      setFabricMessage("A handoff request was broadcast to open HEY tabs. The accepting tab keeps your place.");
    } else {
      errorSound();
      setFabricMessage(result.reason || "Handoff could not be sent in this runtime.");
    }
  }

  function handleProducePairCode() {
    const code = producePairCode();
    setPairCode(code);
    confirmSound();
    setFabricMessage(`Pair code ${code} produced. Remote pairing becomes fully usable once the HEY backend relay is deployed.`);
  }

  function handleAcceptHandoff() {
    const result = acceptHandoff();
    if (result.success) {
      confirmSound();
      setHandoffBundle(null);
      setFabricMessage(`Handoff accepted from ${result.bundle.fromName || "another device"}. Your continuity bundle is available.`);
    } else {
      errorSound();
      setFabricMessage(result.reason || "Nothing to accept.");
    }
  }

  function handleClearBundle() {
    clearHandoffBundle();
    setHandoffBundle(null);
    setFabricMessage("Stored handoff cleared.");
  }

  const longPressGuard = useLongPress(() => {}, { delay: 100 });

  async function analyseImage(dataUrl, sourceLabel) {
    if (!dataUrl) return;
    buzz("light");
    setVisionBusy(true);
    setVisionResult(null);
    try {
      const analysis = await understandImage({
        image: { data: dataUrl, mimeType: dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png" },
        prompt: "Describe the important visible content, any text, and any risk. Be precise and honest.",
        provider: createHeyVisionProvider(),
      });
      if (analysis.success) {
        setVisionResult({
          success: true,
          text: Array.isArray(analysis.observation.observation?.text)
            ? analysis.observation.observation.text.join("\n")
            : String(analysis.observation.observation?.summary || "HEY analysed the image."),
          source: sourceLabel,
          provider: analysis.provider,
          model: analysis.observation?.metadata?.model || null,
        });
        confirmSound();
      } else {
        setVisionResult({ success: false, error: analysis.message });
        errorSound();
      }
    } catch (err) {
      setVisionResult({ success: false, error: err instanceof Error ? err.message : String(err) });
      errorSound();
    } finally {
      setVisionBusy(false);
    }
  }

  async function captureAndAnalyse() {
    setVisionImage("");
    try {
      const frame = await os.captureCamera();
      if (!frame?.success || !frame?.dataUrl) {
        setVisionResult({ success: false, error: frame?.error || "Camera access was not granted." });
        errorSound();
        return;
      }
      setVisionImage(frame.dataUrl);
      await analyseImage(frame.dataUrl, "Camera frame");
    } catch (err) {
      setVisionResult({ success: false, error: err instanceof Error ? err.message : String(err) });
      errorSound();
    }
  }

  function pickFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    fileToDataUrl(file)
      .then((dataUrl) => {
        setVisionImage(dataUrl);
        return analyseImage(dataUrl, "Uploaded image");
      })
      .catch((err) => {
        setVisionResult({ success: false, error: err instanceof Error ? err.message : String(err) });
        errorSound();
      });
  }

  async function runCapability(capability) {
    buzz("light");
    setRunning(capability.id);
    setResults((current) => ({ ...current, [capability.id]: null }));
    try {
      const result = await capability.action();
      setResults((current) => ({ ...current, [capability.id]: result }));
      if (result.success) confirmSound();
      else errorSound();
    } catch (err) {
      setResults((current) => ({
        ...current,
        [capability.id]: { success: false, error: err instanceof Error ? err.message : String(err) },
      }));
      errorSound();
    } finally {
      setRunning(null);
    }
  }

  const availableCount = CAPABILITIES.length;
  const usedCount = Object.values(results).filter((r) => r?.success).length;

  return (
    <div className="page-with-sidebar">
      <Sidebar />

      <main className="page-content">
        <motion.div
          className="px-8 py-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-10 flex items-center justify-between">
            <div>
              <div className="section-label mb-3">Device Capabilities</div>
              <h1 className="font-heading text-6xl text-[var(--text-primary)]">Access</h1>
              <p className="mt-3 text-[var(--text-secondary)]">
                Every capability below asks for permission before touching your device. Nothing runs silently.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="glass-card flex items-center gap-2 p-3">
                <ShieldCheck size={18} color="var(--green-accent)" />
                <span className="text-sm text-[var(--text-secondary)]">
                  {usedCount}/{availableCount} exercised
                </span>
              </div>
            </div>
          </div>

          {Object.values(results).some((r) => !r) && (
            <p className="mb-6 text-sm" style={{ color: "var(--gold)" }}>
              <Sparkles size={14} className="inline mr-2" />
              HEY only opens device access after you explicitly tap a capability.
            </p>
          )}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {CAPABILITIES.map((capability, index) => {
              const Icon = capability.icon;
              const color = ACCENTS[capability.accent];
              const result = results[capability.id];
              const isLoading = running === capability.id;

              return (
                <motion.div
                  key={capability.id}
                  className="glass-card p-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  whileHover={{ y: -4, transition: springs.gentle }}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{ background: `${color}1c` }}
                    >
                      <Icon size={24} color={color} />
                    </div>

                    {result ? (
                      result.success ? (
                        <LockOpen size={18} color="var(--green-accent)" />
                      ) : (
                        <LockKeyhole size={18} color="var(--coral)" />
                      )
                    ) : (
                      <LockKeyhole size={18} color="var(--text-secondary)" />
                    )}
                  </div>

                  <h3 className="mt-5 font-heading text-2xl">{capability.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {capability.description}
                  </p>

                  <motion.button
                    type="button"
                    onClick={() => runCapability(capability)}
                    disabled={isLoading}
                    className="hey-btn-ghost mt-6 flex w-full items-center justify-center gap-2"
                    whileHover={{ scale: 1.02, transition: springs.snappy }}
                    whileTap={{ scale: 0.97, transition: press }}
                    onPointerDown={() => buzz("light")}
                    {...longPressGuard}
                  >
                    {isLoading ? (
                      <RotateCw size={16} className="animate-spin" />
                    ) : (
                      <Icon size={16} />
                    )}
                    {isLoading ? "Requesting..." : result?.success ? "Run again" : "Request access"}
                  </motion.button>

                  <AnimatePresence>
                    {result && <ResultBadge result={result} />}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          <div className="glass-card mt-8 flex items-center gap-4 p-5">
            <Phone size={20} color="var(--gold)" />
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Device access is separate from HEY&apos;s internal permission model. Browser capabilities
              always show their native prompt first, and HEY never bypasses it.
            </p>
          </div>

          {/* Device Fabric */}

          <section className="glass-card mt-8 p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Radio size={24} color="var(--green-accent)" />
                  <h2 className="font-heading text-3xl">Device Fabric</h2>
                </div>
                <p className="mt-3 max-w-2xl leading-7 text-[var(--text-secondary)]">
                  HEY devices can see each other, pass context, and continue your work across
                  tabs on this machine. This device is <strong style={{ color: "var(--text-primary)" }}>{deviceName}</strong>{" "}
                  <span className="text-xs opacity-70">({deviceId.slice(0, 8)}…)</span>.
                </p>
              </div>

              <div className="glass-card flex items-center gap-2 p-3">
                <Sparkles size={16} color="var(--green-accent)" />
                <span className="text-sm text-[var(--text-secondary)]">
                  {peers.length} other {peers.length === 1 ? "device" : "devices"} present
                </span>
              </div>
            </div>

            {!fabricSupported && (
              <p className="mt-4 rounded-2xl p-4 text-sm" style={{ background: "rgba(255,122,138,.08)", color: "var(--coral)" }}>
                Cross-tab fabric is not supported in this runtime. Continuity still works through your
                account&apos;s backend once it is deployed.
              </p>
            )}

            <form className="mt-5 flex flex-wrap items-center gap-3" onSubmit={handleRename}>
              <input
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                aria-label="Device name"
                className="hey-input"
                style={{ maxWidth: 260 }}
              />
              <button type="submit" className="hey-btn-ghost flex items-center gap-2">
                <ShieldCheck size={15} /> Rename
              </button>
            </form>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="hey-btn-primary flex items-center gap-2"
                onClick={handleRequestHandoff}
              >
                <MoveRight size={16} /> Broadcast handoff
              </button>

              <button
                type="button"
                className="hey-btn-ghost flex items-center gap-2"
                onClick={handleProducePairCode}
              >
                <KeyRound size={16} /> Produce pair code
              </button>

              {handoffBundle && (
                <button
                  type="button"
                  className="hey-btn-primary flex items-center gap-2"
                  onClick={handleAcceptHandoff}
                >
                  <Inbox size={16} /> Accept waiting handoff
                </button>
              )}
            </div>

            {pairCode && (
              <p className="mt-4 text-sm" style={{ color: "var(--gold)" }}>
                Active pair code: <strong>{pairCode}</strong>
              </p>
            )}

            {handoffBundle && (
              <div className="mt-4 rounded-2xl p-4 text-sm" style={{ background: "rgba(124,184,124,.08)", color: "var(--text-primary)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-widest" style={{ color: "var(--green-accent)" }}>
                      Continuity bundle from {handoffBundle.fromName || handoffBundle.from}
                    </div>
                    <p className="mt-1">{handoffBundle.note || "A device passed its place to you."}</p>
                  </div>
                  <button
                    type="button"
                    className="hey-btn-ghost shrink-0 text-xs"
                    onClick={handleClearBundle}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {fabricMessage && (
              <p className="mt-4 leading-6 text-sm" style={{ color: "var(--lavender)" }}>
                {fabricMessage}
              </p>
            )}

            <p className="mt-5 text-xs leading-6 opacity-70 text-[var(--text-secondary)]">
              Remote pairing, LAN discovery beyond this browser, and cross-device handoff relays are
              designed as the next layer above this fabric once the HEY backend and Tauri desktop
              builds are deployed. Nothing leaves this device until you approve a handoff.
            </p>
          </section>

          {/* HEY Vision */}

          <section className="glass-card mt-8 p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Eye size={24} color="var(--lavender)" />
                  <h2 className="font-heading text-3xl">HEY Vision</h2>
                </div>
                <p className="mt-3 max-w-2xl leading-7 text-[var(--text-secondary)]">
                  HEY can look at an image and report what is actually visible — objects,
                  text, and anything that looks like a risk. The image is analysed by the
                  HEY edge function and the observation is logged to your account.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="hey-btn-primary flex items-center gap-2"
                onClick={captureAndAnalyse}
                disabled={visionBusy}
              >
                <Camera size={16} />
                {visionBusy ? "Looking..." : "Capture & analyse"}
              </button>

              <button
                type="button"
                className="hey-btn-ghost flex items-center gap-2"
                onClick={() => filePickerRef?.current?.click()}
                disabled={visionBusy}
              >
                <Upload size={16} />
                Choose an image
              </button>

              <input
                ref={filePickerRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                aria-label="Choose an image to analyse"
                onChange={pickFile}
              />
            </div>

            {visionImage && (
              <div className="mt-6 flex items-start gap-4">
                <img
                  src={visionImage}
                  alt="Frame HEY analysed"
                  className="h-40 w-40 rounded-2xl border border-white/10 object-cover"
                />
              </div>
            )}

            {visionResult && (
              <motion.div
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 rounded-2xl p-5 text-sm leading-7"
                style={{
                  background: visionResult.success
                    ? "rgba(124,184,124,.08)"
                    : "rgba(255,122,138,.08)",
                  color: visionResult.success ? "var(--text-primary)" : "var(--coral)",
                }}
              >
                {visionResult.success ? (
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: "var(--green-accent)" }}>
                      <CheckCircle2 size={15} />
                      Verified observation · {visionResult.source}
                      {visionResult.model ? ` · ${visionResult.model}` : ""}
                    </div>
                    <p className="whitespace-pre-wrap text-[var(--text-primary)]">{visionResult.text}</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <XCircle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium">Unavailable</div>
                      <div className="mt-1 text-xs opacity-85">{visionResult.error}</div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </section>
        </motion.div>
      </main>
    </div>
  );
}