import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Hand, Pause, Play, Plus, ShieldCheck, Square, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { gestureEngine } from "./core/gestureEngine.js";
import { subscribe } from "./core/eventBus.js";
import "./GestureStudioPage.css";

const BUILT_IN_LABELS = Object.freeze({ G01: "Open palm", G02: "Open palm to fist", G12: "Two fingers raised", G15: "Thumbs up", G16: "Thumbs down" });
const ACTION_LABELS = Object.freeze({ summon: "Open Dashboard" });

function capabilityMessage(capability) {
  if (!capability) return "Checking camera and local detector support…";
  if (!capability.cameraSupported) return "Camera capture is unavailable in this browser or app environment.";
  if (!capability.adapterInstalled) return "The bundled local hand detector is unavailable in this build.";
  if (capability.status === "permission_denied" || capability.status === "revoked") return "Camera permission is unavailable. Restore access in browser settings, then recheck.";
  if (capability.adapterReady) return "Local hand detection is ready. Camera access starts only after you consent and press Start.";
  return "The hand detector will initialize on this device after you consent and start.";
}

export default function GestureStudioPage() {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState("");
  const [bindings, setBindings] = useState([]);
  const [customGestures, setCustomGestures] = useState([]);
  const [capability, setCapability] = useState(null);
  const [sessionState, setSessionState] = useState(gestureEngine.getRecognitionState());
  const [mode, setMode] = useState("test");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [latestObservation, setLatestObservation] = useState(null);
  const [latestDetection, setLatestDetection] = useState(null);
  const [mapGestureId, setMapGestureId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [customName, setCustomName] = useState("");
  const [customGestureId, setCustomGestureId] = useState("");

  const refresh = useCallback(() => {
    if (!user?.id) return;
    const nextProfiles = gestureEngine.getAllProfiles();
    setProfiles(nextProfiles);
    setProfileId((current) => nextProfiles.some((profile) => profile.id === current) ? current : nextProfiles[0]?.id || "");
    const nextCustomGestures = gestureEngine.getCustomGestures();
    setCustomGestures(nextCustomGestures);
    setCustomGestureId((current) => nextCustomGestures.some((item) => item.id === current) ? current : nextCustomGestures[0]?.id || "");
    setSessionState(gestureEngine.getRecognitionState());
    void gestureEngine.getRecognitionCapability().then(setCapability);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setProfiles([]); setProfileId(""); setCustomGestures([]); setCapability(null);
      return undefined;
    }
    refresh();
    const offEngine = gestureEngine.subscribe((event, payload) => {
      if (["profile_created", "profile_updated", "profile_deleted", "binding_created", "binding_updated", "binding_deleted", "custom_gesture_created", "custom_gesture_sample_recorded"].includes(event)) refresh();
      if (event === "recognition_state_changed") {
        setSessionState(payload?.state || gestureEngine.getRecognitionState());
        void gestureEngine.getRecognitionCapability().then(setCapability);
        if (payload?.reason === "permission_revoked") setError("Camera access was revoked. Recognition stopped and camera tracks were released.");
        if (payload?.reason === "camera_track_ended") setError("The camera feed ended. Recognition stopped and camera tracks were released. Check the camera and restart when ready.");
        if (payload?.reason === "account_changed") setError("The signed-in account changed. The session stopped and account data was cleared.");
      }
      if (event === "recognition_adapter_error") setError("The local detector stopped unexpectedly. Camera access has been released.");
    });
    const offTestDetection = subscribe("gesture.test_detection", (payload) => setLatestDetection(payload?.gesture || null));
    return () => {
      offEngine(); offTestDetection();
      if (gestureEngine.getRecognitionState() !== "inactive") gestureEngine.stopRecognition("studio_closed");
    };
  }, [refresh, user?.id]);

  useEffect(() => {
    const profile = profiles.find((item) => item.id === profileId);
    setBindings(profile ? gestureEngine.getBindingsForProfile(profile.id) : []);
    setMapGestureId("");
  }, [profileId, profiles]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = gestureEngine.getPreviewStream();
    if (video) {
      video.srcObject = stream;
      if (stream) void video.play().catch(() => {});
    }
    return () => { if (video) video.srcObject = null; };
  }, [sessionState]);

  useEffect(() => {
    if (sessionState !== "active" || gestureEngine.getRecognitionMode() !== "test") { setLatestObservation(null); setLatestDetection(null); return undefined; }
    const timer = window.setInterval(() => setLatestObservation(gestureEngine.getLatestDetectorObservation()), 200);
    return () => window.clearInterval(timer);
  }, [sessionState]);

  const active = sessionState === "active";
  const paused = sessionState === "paused";
  const cameraBlocked = !capability || !capability.cameraSupported || !capability.adapterInstalled || capability.status === "permission_denied" || capability.status === "revoked";
  const custom = customGestures.find((item) => item.id === customGestureId);
  const customConflicts = custom ? gestureEngine.getCustomGestureConflicts(custom.id) : { status: "insufficient_samples", conflicts: [] };
  const supportedGestureIds = capability?.supportedGestureIds || [];
  const canUseActiveMode = bindings.some((binding) => binding.enabled);

  async function createProfile(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const profile = gestureEngine.createProfile({ name: profileName.trim() || "Gesture profile", confidence: 0.9, holdMs: 500, cooldownMs: 800 });
      setProfileName(""); refresh(); setProfileId(profile.id); setMessage("Account-scoped profile created.");
    } catch (failure) { setError(failure?.message || "Profile could not be saved."); }
  }

  function editProfile(field, value) {
    try { gestureEngine.updateProfile(profileId, { [field]: value }); refresh(); }
    catch (failure) { setError(failure?.message || "Profile setting could not be saved."); }
  }

  async function startSession() {
    if (!consent || !profileId || busy) return;
    if (mode === "active" && !canUseActiveMode) { setError("Add an enabled safe mapping before starting active mode."); return; }
    setBusy(true); setError(""); setMessage(""); setMode(mode);
    try {
      const result = await gestureEngine.startRecognition(profileId, { consent: true, mode });
      if (!result.success) throw new Error(result.error || "Gesture recognition could not start.");
      setSessionState(gestureEngine.getRecognitionState());
      setMessage(mode === "test" ? "Test mode is active. Gestures are observed locally; no actions are dispatched." : "Active mode is running locally. Only supported mapped actions can run.");
      setCapability(await gestureEngine.getRecognitionCapability());
    } catch (failure) {
      setSessionState(gestureEngine.getRecognitionState()); setCapability(await gestureEngine.getRecognitionCapability()); setError(failure?.message || "Gesture recognition could not start.");
    } finally { setBusy(false); }
  }

  function stopSession() {
    gestureEngine.stopRecognition("user_stop"); setSessionState(gestureEngine.getRecognitionState()); setConsent(false); setLatestObservation(null); setMessage("Recognition stopped and camera released.");
  }

  function saveMapping(event) {
    event.preventDefault(); if (!profileId || !mapGestureId) return;
    const existing = bindings.find((binding) => binding.gestureId === mapGestureId);
    try {
      if (existing) gestureEngine.updateBinding(existing.id, { action: "summon", actionType: "ui", enabled: true });
      else gestureEngine.createBinding({ profileId, gestureId: mapGestureId, action: "summon", actionType: "ui" });
      refresh(); setMessage("Mapping saved: this gesture opens the Dashboard after the profile hold and confidence checks.");
    } catch (failure) { setError(failure?.message || "Mapping could not be saved."); }
  }

  function createCustom(event) {
    event.preventDefault();
    try {
      const created = gestureEngine.createCustomGesture({ name: customName.trim(), action: "summon", actionType: "ui" });
      setCustomName(""); setCustomGestureId(created.id); refresh(); setMessage("Custom gesture profile created. Capture at least three real detector samples in test mode.");
    } catch (failure) { setError(failure?.message || "Custom gesture profile could not be created."); }
  }

  function captureSample() {
    try {
      const result = gestureEngine.captureCustomGestureSample(customGestureId);
      if (!result.success) throw new Error(result.error || "No recent detector sample is available.");
      refresh(); setMessage(`Detector sample ${result.sampleCount} saved locally. Raw camera frames are not stored.`);
    } catch (failure) { setError(failure?.message || "Sample could not be saved."); }
  }

  function mapCustom() {
    if (!custom || custom.templates.length < 3 || customConflicts.status !== "clear") return;
    try {
      const existing = bindings.find((binding) => binding.gestureId === custom.id);
      if (!existing) gestureEngine.createBinding({ profileId, gestureId: custom.id, action: "summon", actionType: "ui" });
      refresh(); setMessage("Trained gesture mapped to open the Dashboard.");
    } catch (failure) { setError(failure?.message || "Custom gesture is not ready to map."); }
  }

  function testCustom() {
    const result = gestureEngine.testCustomGesture(customGestureId);
    if (!result.success) { setError(result.error || "Record three real samples before testing this custom gesture."); return; }
    setError(""); setMessage("Custom gesture matching is enabled for this test session. Actions remain suppressed.");
  }

  const detectedLabel = latestDetection?.id
    ? (customGestures.find((item) => item.id === latestDetection.id)?.name || BUILT_IN_LABELS[latestDetection.id] || "Gesture observed")
    : latestObservation ? "Hand pose in view" : "No recent hand pose";

  return (
    <main className="hey-gesture-studio" aria-labelledby="gesture-studio-title">
      <header className="hey-gesture-studio__header">
        <div><p className="hey-gesture-studio__eyebrow">HEY · LOCAL CONTROLS</p><h1 id="gesture-studio-title">Gesture Studio</h1><p>Configure an account profile, map supported hand poses, and verify them before turning on actions.</p></div>
        <Link to="/tools" className="hey-gesture-studio__link">Browse Tool Library</Link>
      </header>
      {!user?.id && <section className="hey-gesture-studio__card"><p>Sign in to create a private, account-scoped gesture profile.</p></section>}
      {user?.id && <>
        <section className="hey-gesture-studio__card" aria-labelledby="gesture-profile-title">
          <div className="hey-gesture-studio__section-heading"><Hand size={20}/><div><h2 id="gesture-profile-title">Profile and calibration</h2><p>Controls are saved to your account and can only be edited while recognition is stopped.</p></div></div>
          <form className="hey-gesture-studio__inline-form" onSubmit={createProfile}><label>New profile name<input maxLength={80} value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="My gesture profile" /></label><button type="submit" disabled={profiles.length >= 32}><Plus size={16}/> Add profile</button></form>
          {profiles.length > 0 && <>
            <label className="hey-gesture-studio__field">Active profile<select value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={active || paused}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
            {profiles.filter((item) => item.id === profileId).map((profile) => <div className="hey-gesture-studio__controls" key={profile.id}>
              <label>Dominant hand<select value={profile.handedness} disabled={active || paused} onChange={(event) => editProfile("handedness", event.target.value)}><option value="right">Right hand</option><option value="left">Left hand</option><option value="both">Either hand</option></select></label>
              <label>Sensitivity <span>{profile.sensitivity.toFixed(1)}</span><input type="range" min="0.1" max="1" step="0.1" value={profile.sensitivity} disabled={active || paused} onChange={(event) => editProfile("sensitivity", Number(event.target.value))}/></label>
              <label>Confidence threshold <span>{profile.confidence.toFixed(2)}</span><input type="range" min="0.7" max="0.99" step="0.01" value={profile.confidence} disabled={active || paused} onChange={(event) => editProfile("confidence", Number(event.target.value))}/></label>
              <label>Hold time <span>{profile.holdMs} ms</span><input type="range" min="200" max="1500" step="100" value={profile.holdMs} disabled={active || paused} onChange={(event) => editProfile("holdMs", Number(event.target.value))}/></label>
              <label>Cooldown <span>{profile.cooldownMs} ms</span><input type="range" min="200" max="2000" step="100" value={profile.cooldownMs} disabled={active || paused} onChange={(event) => editProfile("cooldownMs", Number(event.target.value))}/></label>
              <label>Profile name<input maxLength={80} value={profile.name} disabled={active || paused} onChange={(event) => editProfile("name", event.target.value)}/></label>
              <button className="hey-gesture-studio__danger" type="button" disabled={active || paused} onClick={() => { if (profiles.length === 1) { setError("Create another profile before deleting the last one."); return; } gestureEngine.deleteProfile(profile.id); refresh(); }}>Delete profile</button>
            </div>)}
          </>}
        </section>

        <section className="hey-gesture-studio__card" aria-labelledby="gesture-mapping-title">
          <div className="hey-gesture-studio__section-heading"><ShieldCheck size={20}/><div><h2 id="gesture-mapping-title">Safe mappings</h2><p>Only the bundled detector’s supported gestures and the implemented “Open Dashboard” action are available here.</p></div></div>
          {profileId ? <>
            <form className="hey-gesture-studio__inline-form" onSubmit={saveMapping}><label>Gesture<select required value={mapGestureId} disabled={active || paused} onChange={(event) => setMapGestureId(event.target.value)}><option value="">Choose a supported gesture</option>{supportedGestureIds.map((id) => <option key={id} value={id}>{BUILT_IN_LABELS[id] || id}</option>)}{customGestures.filter((item) => item.templates.length >= 3 && gestureEngine.getCustomGestureConflicts(item.id).status === "clear").map((item) => <option key={item.id} value={item.id}>{item.name} · trained</option>)}</select></label><button type="submit" disabled={!mapGestureId || active || paused}><Plus size={16}/> {bindings.some((item) => item.gestureId === mapGestureId) ? "Update mapping" : "Add mapping"}</button></form>
            <ul className="hey-gesture-studio__mapping-list">{bindings.map((binding) => <li key={binding.id}><span><strong>{BUILT_IN_LABELS[binding.gestureId] || customGestures.find((item) => item.id === binding.gestureId)?.name || binding.gestureId}</strong><small>{ACTION_LABELS[binding.action] || "Unsupported action"} · {binding.enabled ? "Enabled" : "Disabled"}</small></span><button type="button" aria-label="Remove mapping" disabled={active || paused} onClick={() => { gestureEngine.deleteBinding(binding.id); refresh(); }}><Trash2 size={16}/></button></li>)}{bindings.length === 0 && <li><span>No gestures are mapped yet.</span></li>}</ul>
          </> : <p>Create a profile before adding mappings.</p>}
        </section>

        <section className="hey-gesture-studio__card" aria-labelledby="gesture-recognition-title">
          <div className="hey-gesture-studio__section-heading"><Camera size={20}/><div><h2 id="gesture-recognition-title">Camera and recognition</h2><p>{capabilityMessage(capability)}</p></div></div>
          <p className="hey-gesture-studio__privacy">Camera access is requested only after your explicit consent and Start. Camera frames and hand poses are processed on this device and are not sent to Google. Separately, the MediaPipe Tasks SDK sends performance and utilization metrics to Google. Raw video is not saved. Test mode never dispatches mapped actions.</p>
          <div className="hey-gesture-studio__session-controls">
            {!active && !paused && <><label>Session mode<select value={mode} onChange={(event) => setMode(event.target.value)} disabled={busy}><option value="test">Test only · no actions</option><option value="active" disabled={!canUseActiveMode}>Active · mapped actions</option></select></label><label className="hey-gesture-studio__consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy || !profileId || cameraBlocked}/><span>I consent to camera use for this gesture session.</span></label><button type="button" onClick={startSession} disabled={busy || !consent || !profileId || cameraBlocked}><Camera size={16}/>{busy ? "Starting…" : "Start recognition"}</button></>}
            {active && <><button type="button" onClick={() => gestureEngine.pauseRecognition()}><Pause size={16}/> Pause</button><button type="button" className="secondary" onClick={stopSession}><Square size={16}/> Stop</button></>}
            {paused && <><button type="button" onClick={() => gestureEngine.resumeRecognition()}><Play size={16}/> Resume</button><button type="button" className="secondary" onClick={stopSession}><Square size={16}/> Stop</button></>}
            {["permission_denied", "revoked"].includes(capability?.status) && <button type="button" className="secondary" onClick={() => { void gestureEngine.getRecognitionCapability().then(setCapability); }}>Recheck camera access</button>}
          </div>
          {(active || paused) && <div className="hey-gesture-studio__preview"><video ref={videoRef} autoPlay muted playsInline aria-label="Live local gesture camera preview"/><p role="status">{paused ? "Paused · camera still active" : mode === "test" ? `Test mode · ${detectedLabel}${latestDetection ? ` · ${Math.round(latestDetection.confidence * 100)}% match confidence` : latestObservation ? ` · ${Math.round(latestObservation.handConfidence * 100)}% hand confidence` : ""}` : "Active mode · local hand detection"}</p></div>}
          <p className="hey-gesture-studio__status" role="status">Session: {sessionState}{capability?.adapterKind ? ` · Detector: ${capability.adapterKind}` : ""}</p>
        </section>

        <section className="hey-gesture-studio__card" aria-labelledby="gesture-custom-title">
          <div className="hey-gesture-studio__section-heading"><Hand size={20}/><div><h2 id="gesture-custom-title">Train a custom pose</h2><p>Capture three or more live detector samples in test mode. Stored data contains normalized hand landmarks only.</p></div></div>
          <form className="hey-gesture-studio__inline-form" onSubmit={createCustom}><label>Custom gesture name<input maxLength={80} value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="For example, my quiet signal"/></label><button type="submit" disabled={!profileId || customGestures.length >= 32}><Plus size={16}/> Create</button></form>
          {customGestures.length > 0 && <label className="hey-gesture-studio__field">Custom gesture<select value={customGestureId} onChange={(event) => setCustomGestureId(event.target.value)}>{customGestures.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.templates.length} samples</option>)}</select></label>}
          {custom && <><p className="hey-gesture-studio__sample-count">{custom.templates.length} / 64 detector samples · {custom.templates.length >= 3 ? customConflicts.status === "clear" ? "No similar trained pose found" : "Similar pose conflict found" : "Three samples required"}</p>{customConflicts.conflicts.map((conflict) => <p key={conflict.gestureId} className="hey-gesture-studio__warning">This pose is similar to “{conflict.name}” ({Math.round(conflict.similarity * 100)}%). Add clearer samples or remove the conflicting profile before mapping.</p>)}
            <div className="hey-gesture-studio__session-controls"><button type="button" onClick={captureSample} disabled={!active || mode !== "test" || !latestObservation}>Capture current pose</button><button type="button" className="secondary" onClick={testCustom} disabled={custom.templates.length < 3 || !active || mode !== "test"}>Test this pose live</button><button type="button" onClick={mapCustom} disabled={!profileId || custom.templates.length < 3 || customConflicts.status !== "clear" || active || paused}>Map to Dashboard</button><button type="button" className="secondary" disabled={active || paused} onClick={() => { gestureEngine.deleteCustomGesture(custom.id); setCustomGestureId(""); refresh(); }}>Delete custom pose</button></div>
          </>}
        </section>
      </>}
      {message && <p className="hey-gesture-studio__message" role="status">{message}</p>}
      {error && <p className="hey-gesture-studio__error" role="alert">{error}</p>}
      <p className="hey-gesture-studio__footer">Available bundled poses: {supportedGestureIds.map((id) => BUILT_IN_LABELS[id] || id).join(", ") || "Checking detector"}. Other gestures remain unsupported here.</p>
    </main>
  );
}
