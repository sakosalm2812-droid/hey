import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Hand, Pause, Play, ShieldCheck, Square } from "lucide-react";
import { useAuth } from "../../AuthContext.jsx";
import { gestureEngine } from "../../core/gestureEngine.js";
import { subscribe } from "../../core/eventBus.js";
import "./GestureControls.css";

const ACTION_LABELS = Object.freeze({
  summon: "Open Dashboard",
  cancel: "Cancel",
  navigate_back: "Go back",
  navigate_forward: "Go forward",
  minimize: "Minimize panel",
  expand: "Expand panel",
  overview: "Show overview",
  dismiss: "Dismiss",
  scroll: "Scroll",
});

function capabilityMessage(capability) {
  if (!capability) return "Checking camera and local detector support…";
  if (!capability.cameraSupported) return "Camera access is unavailable in this browser or app environment.";
  if (!capability.adapterInstalled) return "The bundled hand detector is unavailable in this build.";
  if (capability.status === "permission_denied") return "Camera access is blocked. Allow camera access in your browser settings, then try again.";
  if (capability.status === "revoked") return "Camera access was revoked. Recognition has stopped; restore camera permission before restarting.";
  if (capability.adapterReady) return "The local hand detector is ready. Camera access begins only after you consent and start.";
  return "The local hand detector will initialize on this device after you consent and start.";
}

export default function GestureControls() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState("");
  const [bindings, setBindings] = useState([]);
  const [capability, setCapability] = useState(null);
  const [sessionState, setSessionState] = useState(gestureEngine.getRecognitionState());
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshProfiles = useCallback(() => {
    const nextProfiles = gestureEngine.getAllProfiles();
    setProfiles(nextProfiles);
    setProfileId((current) => nextProfiles.some((profile) => profile.id === current) ? current : nextProfiles[0]?.id || "");
    setSessionState(gestureEngine.getRecognitionState());
    void gestureEngine.getRecognitionCapability().then(setCapability);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setProfiles([]);
      setProfileId("");
      setCapability(null);
      return undefined;
    }
    refreshProfiles();
    const unsubscribeEngine = gestureEngine.subscribe((event, payload) => {
      if (event === "profile_created" || event === "profile_deleted" || event === "binding_created" || event === "binding_deleted") refreshProfiles();
      if (event === "recognition_state_changed") {
        setSessionState(payload?.state || gestureEngine.getRecognitionState());
        void gestureEngine.getRecognitionCapability().then(setCapability);
        if (payload?.reason === "permission_revoked") setError("Camera permission was revoked. Recognition stopped and camera tracks were released.");
        if (payload?.reason === "account_changed") setError("The signed-in account changed. The gesture session stopped and account data was cleared.");
      }
      if (event === "recognition_adapter_error") setError("The local detector stopped unexpectedly. Camera access has been released.");
    });
    const unsubscribeAction = subscribe("gesture.action_executed", ({ action }) => {
      if (action?.action === "summon") {
        navigate("/dashboard");
        setMessage("Dashboard opened by gesture.");
      }
    });
    return () => {
      unsubscribeEngine();
      unsubscribeAction();
      if (gestureEngine.getRecognitionState() !== "inactive") gestureEngine.stopRecognition("settings_closed");
    };
  }, [navigate, refreshProfiles, user?.id]);

  useEffect(() => {
    const profile = profiles.find((item) => item.id === profileId);
    setBindings(profile ? gestureEngine.getBindingsForProfile(profile.id) : []);
  }, [profileId, profiles]);

  const openPalmBinding = bindings.find((binding) => binding.gestureId === "G01");

  async function createSafeSetup() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!user?.id) throw new Error("Sign in to save gesture preferences to your account.");
      const profile = gestureEngine.createProfile({ name: "Gesture controls", confidence: 0.9, holdMs: 500, cooldownMs: 800 });
      try {
        gestureEngine.createBinding({ profileId: profile.id, gestureId: "G01", action: "summon", actionType: "ui" });
      } catch (setupError) {
        gestureEngine.deleteProfile(profile.id);
        throw setupError;
      }
      refreshProfiles();
      setProfileId(profile.id);
      setMessage("Gesture profile saved to your account. An open palm will open the Dashboard after a steady hold.");
    } catch (setupError) {
      setError(setupError?.message || "Gesture preferences could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function ensureOpenPalmBinding() {
    if (!profileId || openPalmBinding) return;
    setBusy(true);
    setError("");
    try {
      gestureEngine.createBinding({ profileId, gestureId: "G01", action: "summon", actionType: "ui" });
      refreshProfiles();
      setMessage("Open palm is now mapped to open the Dashboard.");
    } catch (setupError) {
      setError(setupError?.message || "The safe gesture mapping could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!consent || !profileId || !openPalmBinding || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await gestureEngine.startRecognition(profileId, { consent: true });
      if (!result.success) throw new Error(result.error || "Gesture recognition could not start.");
      setSessionState(gestureEngine.getRecognitionState());
      setCapability(await gestureEngine.getRecognitionCapability());
      setMessage("Gesture recognition is active. Camera frames are processed on this device.");
    } catch (startError) {
      setSessionState(gestureEngine.getRecognitionState());
      setCapability(await gestureEngine.getRecognitionCapability());
      setError(startError?.message || "Gesture recognition could not start.");
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    gestureEngine.stopRecognition("user_stop");
    setSessionState(gestureEngine.getRecognitionState());
    setConsent(false);
    setMessage("Recognition stopped and camera released.");
  }

  const active = sessionState === "active";
  const paused = sessionState === "paused";
  const unsupported = capability && (!capability.cameraSupported || !capability.adapterInstalled || capability.status === "permission_denied" || capability.status === "revoked");

  return (
    <section className="hey-settings-card hey-gesture-card" aria-labelledby="hey-gesture-title">
      <header className="hey-settings-card-header">
        <Hand size={20} aria-hidden="true" />
        <div>
          <h2 id="hey-gesture-title">Gesture controls</h2>
          <p>Use an open palm to open your Dashboard. Detection runs locally on this device.</p>
        </div>
      </header>

      <div className="hey-gesture-status" role="status">
        <span className={`hey-settings-status-dot ${active ? "ok" : unsupported ? "warn" : ""}`} />
        <span>{active ? "Camera active · local detection" : paused ? "Paused · camera still active" : capabilityMessage(capability)}</span>
      </div>
      {!active && !paused && capability?.cameraSupported && (capability.status === "permission_denied" || capability.status === "revoked") && (
        <button type="button" className="hey-btn-secondary" onClick={() => { void gestureEngine.getRecognitionCapability().then(setCapability); }}>
          Recheck camera access
        </button>
      )}

      {!user?.id && <p className="hey-gesture-note">Sign in to create an account-scoped gesture profile.</p>}
      {user?.id && profiles.length === 0 && (
        <div className="hey-gesture-setup">
          <p>Your settings are stored with your account. The default mapping is limited to opening the Dashboard.</p>
          <button type="button" className="hey-btn-primary" onClick={createSafeSetup} disabled={busy}>
            <ShieldCheck size={15} /> Set up gesture controls
          </button>
        </div>
      )}

      {profiles.length > 0 && (
        <>
          {profiles.length > 1 && (
            <label className="hey-gesture-profile-select">
              <span>Account profile</span>
              <select value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={active || paused}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>
          )}
          <div className="hey-gesture-details">
            <div><span>Gesture</span><strong>Open palm · steady for {profiles.find((item) => item.id === profileId)?.holdMs || 500} ms</strong></div>
            <div><span>Low risk action</span><strong>{openPalmBinding ? ACTION_LABELS[openPalmBinding.action] || "Safe UI action" : "Not mapped"}</strong></div>
          </div>
          {!openPalmBinding && sessionState === "inactive" && (
            <button type="button" className="hey-btn-primary" onClick={ensureOpenPalmBinding} disabled={busy || !profileId}>
              Add safe open palm mapping
            </button>
          )}

          {!active && !paused && (
            <label className="hey-gesture-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy || !openPalmBinding || unsupported} />
              <span><strong>Allow camera use for gesture control</strong><small>Camera access is requested only when you press Start. You can stop it at any time.</small></span>
            </label>
          )}

          <div className="hey-gesture-actions">
            {!active && !paused && (
              <button type="button" className="hey-btn-primary" onClick={start} disabled={busy || !consent || !openPalmBinding || unsupported}>
                <Camera size={15} /> {busy ? "Starting…" : "Start gesture control"}
              </button>
            )}
            {active && <button type="button" className="hey-btn-primary" onClick={() => { gestureEngine.pauseRecognition(); setSessionState(gestureEngine.getRecognitionState()); }}><Pause size={15} /> Pause</button>}
            {paused && <button type="button" className="hey-btn-primary" onClick={() => { gestureEngine.resumeRecognition(); setSessionState(gestureEngine.getRecognitionState()); }}><Play size={15} /> Resume</button>}
            {(active || paused || sessionState === "calibrating") && <button type="button" className="hey-btn-secondary" onClick={stop}><Square size={14} /> Stop</button>}
          </div>
        </>
      )}

      {message && <p className="hey-gesture-note" role="status">{message}</p>}
      {error && <p className="hey-gesture-error" role="alert">{error}</p>}
      <p className="hey-gesture-note">Only account-scoped, allowlisted low-risk UI mappings can run. Gestures must meet the confidence threshold and hold time before an action fires.</p>
    </section>
  );
}
