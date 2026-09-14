import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { getSetting } from "./settingsRegistry.js";

const LIVE_STATES = Object.freeze({
  IDLE: "idle",
  INITIALIZING: "initializing",
  ACTIVE: "active",
  SOURCE_PAUSED: "source_paused",
  PERMISSION_LOST: "permission_lost",
  RECONNECTING: "reconnecting",
  ENDING: "ending",
  ENDED: "ended",
});

const LIVE_MODES = Object.freeze({
  GUIDE: "guide",
  ASSIST: "assist",
  ACT: "act",
});

const SOURCE_TYPES = Object.freeze({
  SCREEN: "screen",
  WINDOW: "window",
  REGION: "region",
  CAMERA: "camera",
  MICROPHONE: "microphone",
  DOCUMENT: "document",
});

const OVERLAY_TYPES = Object.freeze({
  HIGHLIGHT: "highlight",
  LABEL: "label",
  ARROW: "arrow",
  STEP_MARKER: "step_marker",
  DIM_AREA: "dim_area",
});

function generateSessionId() {
  return `live_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateSourceId() {
  return `src_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateOverlayId() {
  return `overlay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class HeyLiveEngine {
  constructor() {
    this.sessions = new Map();
    this.activeSession = null;
    this.listeners = new Set();
  }

  createSession(input = {}) {
    const sessionId = generateSessionId();
    const now = new Date().toISOString();
    
    const session = {
      id: sessionId,
      state: LIVE_STATES.IDLE,
      mode: input.mode || LIVE_MODES.GUIDE,
      projectId: input.projectId || null,
      sources: new Map(),
      overlays: new Map(),
      permissions: {
        screen: false,
        camera: false,
        microphone: false,
      },
      rawRetention: input.rawRetention || getSetting("live.raw_retention") || false,
      quality: input.quality || "high",
      bandwidthCap: input.bandwidthCap || null,
      excludedApps: input.excludedApps || [],
      excludedWindows: input.excludedWindows || [],
      sensitiveScreenMode: input.sensitiveScreenMode || false,
      recording: false,
      recordingId: null,
      metrics: {
        framesProcessed: 0,
        actionsExecuted: 0,
        avgLatency: 0,
        startedAt: null,
      },
      createdAt: now,
      startedAt: null,
      endedAt: null,
    };

    this.sessions.set(sessionId, session);
    this.notify("session_created", session);
    
    publish("live.session_created", session);
    recordAudit({ action: "live.session_created", status: "completed", metadata: { sessionId, mode: session.mode } });
    
    return session;
  }

  getSession(id) {
    return this.sessions.get(id) || null;
  }

  getActiveSession() {
    return this.activeSession;
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  async startSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };
    if (session.state !== LIVE_STATES.IDLE) return { error: "Session already started" };

    session.state = LIVE_STATES.INITIALIZING;
    this.notify("session_state_changed", session);

    try {
      const permissions = await this.requestPermissions(session);
      session.permissions = permissions;
      
      if (!permissions.screen && !permissions.camera) {
        throw new Error("At least screen or camera permission required");
      }

      session.state = LIVE_STATES.ACTIVE;
      session.startedAt = new Date().toISOString();
      session.metrics.startedAt = session.startedAt;
      this.activeSession = session;
      
      this.notify("session_state_changed", session);
      publish("live.session_started", session);
      recordAudit({ action: "live.session_started", status: "completed", metadata: { sessionId } });
      
      return { success: true, session };
    } catch (error) {
      session.state = LIVE_STATES.PERMISSION_LOST;
      session.error = error.message;
      this.notify("session_state_changed", session);
      return { error: error.message };
    }
  }

  async requestPermissions(session) {
    const permissions = { screen: false, camera: false, microphone: false };
    
    try {
      if (session.sources.has("screen") || session.sources.has("window") || session.sources.has("region")) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false,
        });
        session.screenStream = stream;
        permissions.screen = true;
      }
    } catch (e) {
      console.warn("Screen permission denied:", e);
    }

    try {
      if (session.sources.has("camera")) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        session.cameraStream = stream;
        permissions.camera = true;
      }
    } catch (e) {
      console.warn("Camera permission denied:", e);
    }

    try {
      if (session.sources.has("microphone")) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        session.microphoneStream = stream;
        permissions.microphone = true;
      }
    } catch (e) {
      console.warn("Microphone permission denied:", e);
    }

    return permissions;
  }

  addSource(sessionId, input) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    const sourceId = generateSourceId();
    const source = {
      id: sourceId,
      type: input.type,
      name: input.name || input.type,
      stream: input.stream || null,
      constraints: input.constraints || {},
      active: false,
      paused: false,
      createdAt: new Date().toISOString(),
      metadata: input.metadata || {},
    };

    session.sources.set(sourceId, source);
    this.notify("source_added", { sessionId, source });
    return source;
  }

  switchSource(sessionId, sourceId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    const source = session.sources.get(sourceId);
    if (!source) return { error: "Source not found" };

    session.sources.forEach(s => { s.active = false; });
    source.active = true;
    
    this.notify("source_switched", { sessionId, sourceId, source });
    publish("live.source_switched", { sessionId, sourceId, sourceType: source.type });
    
    return { success: true, source };
  }

  removeSource(sessionId, sourceId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    const source = session.sources.get(sourceId);
    if (!source) return { error: "Source not found" };

    if (source.stream) {
      source.stream.getTracks().forEach(t => t.stop());
    }

    session.sources.delete(sourceId);
    this.notify("source_removed", { sessionId, sourceId });
    return { success: true };
  }

  async processInput(sessionId, input) {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== LIVE_STATES.ACTIVE) return { error: "Session not active" };

    const activeSource = Array.from(session.sources.values()).find(s => s.active);
    if (!activeSource) return { error: "No active source" };

    session.metrics.framesProcessed++;
    
    publish("live.input_received", { sessionId, input, sourceId: activeSource.id });
    
    return { success: true, processed: true };
  }

  async executeAction(sessionId, action) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    if (session.mode === LIVE_MODES.GUIDE) {
      return { error: "Cannot execute actions in Guide mode. Switch to Assist or Act mode." };
    }

    if (session.mode === LIVE_MODES.ASSIST && action.riskLevel === "high") {
      return { error: "High-risk actions require Act mode" };
    }

    session.metrics.actionsExecuted++;
    
    publish("live.action_executed", { sessionId, action, mode: session.mode });
    recordAudit({ action: "live.action_executed", status: "completed", metadata: { sessionId, action, mode: session.mode } });
    
    return { success: true, executed: true };
  }

  setMode(sessionId, mode) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };
    if (!Object.values(LIVE_MODES).includes(mode)) return { error: "Invalid mode" };

    const oldMode = session.mode;
    session.mode = mode;
    
    this.notify("mode_changed", { sessionId, oldMode, newMode: mode });
    publish("live.mode_changed", { sessionId, oldMode, newMode: mode });
    
    return { success: true, mode };
  }

  addOverlay(sessionId, input) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    const overlayId = generateOverlayId();
    const overlay = {
      id: overlayId,
      type: input.type,
      target: input.target,
      content: input.content,
      position: input.position,
      style: input.style || {},
      expiresAt: input.expiresAt || null,
      createdAt: new Date().toISOString(),
    };

    session.overlays.set(overlayId, overlay);
    this.notify("overlay_added", { sessionId, overlay });
    return overlay;
  }

  removeOverlay(sessionId, overlayId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    session.overlays.delete(overlayId);
    this.notify("overlay_removed", { sessionId, overlayId });
    return { success: true };
  }

  updateOverlay(sessionId, overlayId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    const overlay = session.overlays.get(overlayId);
    if (!overlay) return { error: "Overlay not found" };

    const updated = { ...overlay, ...updates };
    session.overlays.set(overlayId, updated);
    this.notify("overlay_updated", { sessionId, overlay: updated });
    return updated;
  }

  addHighlight(sessionId, input) {
    return this.addOverlay(sessionId, { type: OVERLAY_TYPES.HIGHLIGHT, ...input });
  }

  addLabel(sessionId, input) {
    return this.addOverlay(sessionId, { type: OVERLAY_TYPES.LABEL, ...input });
  }

  addArrow(sessionId, input) {
    return this.addOverlay(sessionId, { type: OVERLAY_TYPES.ARROW, ...input });
  }

  addStepMarker(sessionId, input) {
    return this.addOverlay(sessionId, { type: OVERLAY_TYPES.STEP_MARKER, ...input });
  }

  dimArea(sessionId, input) {
    return this.addOverlay(sessionId, { type: OVERLAY_TYPES.DIM_AREA, ...input });
  }

  pauseSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    session.state = LIVE_STATES.SOURCE_PAUSED;
    session.sources.forEach(s => { s.paused = true; });
    
    this.notify("session_paused", session);
    publish("live.session_paused", session);
    return { success: true };
  }

  resumeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    session.state = LIVE_STATES.ACTIVE;
    session.sources.forEach(s => { s.paused = false; });
    
    this.notify("session_resumed", session);
    publish("live.session_resumed", session);
    return { success: true };
  }

  async stopSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    session.state = LIVE_STATES.ENDING;
    this.notify("session_state_changed", session);

    session.sources.forEach(source => {
      if (source.stream) source.stream.getTracks().forEach(t => t.stop());
    });

    if (session.screenStream) session.screenStream.getTracks().forEach(t => t.stop());
    if (session.cameraStream) session.cameraStream.getTracks().forEach(t => t.stop());
    if (session.microphoneStream) session.microphoneStream.getTracks().forEach(t => t.stop());

    session.state = LIVE_STATES.ENDED;
    session.endedAt = new Date().toISOString();
    this.activeSession = null;
    
    this.notify("session_ended", session);
    publish("live.session_ended", session);
    recordAudit({ action: "live.session_ended", status: "completed", metadata: { sessionId, duration: new Date(session.endedAt) - new Date(session.startedAt) } });
    
    return { success: true };
  }

  grantPermission(sessionId, permission, granted = true) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    session.permissions[permission] = granted;
    this.notify("permission_changed", { sessionId, permission, granted });
    return { success: true };
  }

  revokePermission(sessionId, permission) {
    return this.grantPermission(sessionId, permission, false);
  }

  getMetrics(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId,
      state: session.state,
      mode: session.mode,
      sourcesCount: session.sources.size,
      overlaysCount: session.overlays.size,
      framesProcessed: session.metrics.framesProcessed,
      actionsExecuted: session.metrics.actionsExecuted,
      avgLatency: session.metrics.avgLatency,
      uptime: session.startedAt ? new Date() - new Date(session.startedAt) : 0,
    };
  }

  reconnectSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    session.state = LIVE_STATES.RECONNECTING;
    this.notify("session_reconnecting", session);
    
    return this.startSession(sessionId);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Live listener error:", err); }
    });
  }
}

export const heyLiveEngine = new HeyLiveEngine();

export function createLiveSession(input) {
  return heyLiveEngine.createSession(input);
}

export function startLiveSession(sessionId) {
  return heyLiveEngine.startSession(sessionId);
}

export function addLiveSource(sessionId, input) {
  return heyLiveEngine.addSource(sessionId, input);
}

export function switchLiveSource(sessionId, sourceId) {
  return heyLiveEngine.switchSource(sessionId, sourceId);
}

export function removeLiveSource(sessionId, sourceId) {
  return heyLiveEngine.removeSource(sessionId, sourceId);
}

export function processLiveInput(sessionId, input) {
  return heyLiveEngine.processInput(sessionId, input);
}

export function executeLiveAction(sessionId, action) {
  return heyLiveEngine.executeAction(sessionId, action);
}

export function setLiveMode(sessionId, mode) {
  return heyLiveEngine.setMode(sessionId, mode);
}

export function updateLiveOverlay(sessionId, overlayId, updates) {
  return heyLiveEngine.updateOverlay(sessionId, overlayId, updates);
}

export function addLiveHighlight(sessionId, input) {
  return heyLiveEngine.addHighlight(sessionId, input);
}

export function removeLiveHighlight(sessionId, overlayId) {
  return heyLiveEngine.removeOverlay(sessionId, overlayId);
}

export function addLiveLabel(sessionId, input) {
  return heyLiveEngine.addLabel(sessionId, input);
}

export function addLiveArrow(sessionId, input) {
  return heyLiveEngine.addArrow(sessionId, input);
}

export function addLiveStepMarker(sessionId, input) {
  return heyLiveEngine.addStepMarker(sessionId, input);
}

export function dimLiveArea(sessionId, input) {
  return heyLiveEngine.dimArea(sessionId, input);
}

export function pauseLiveSession(sessionId) {
  return heyLiveEngine.pauseSession(sessionId);
}

export function resumeLiveSession(sessionId) {
  return heyLiveEngine.resumeSession(sessionId);
}

export function stopLiveSession(sessionId) {
  return heyLiveEngine.stopSession(sessionId);
}

export function getLiveSession(sessionId) {
  return heyLiveEngine.getSession(sessionId);
}

export function getActiveLiveSession() {
  return heyLiveEngine.getActiveSession();
}

export function listLiveSessions() {
  return heyLiveEngine.getAllSessions();
}

export function grantLivePermission(sessionId, permission, granted) {
  return heyLiveEngine.grantPermission(sessionId, permission, granted);
}

export function revokeLivePermission(sessionId, permission) {
  return heyLiveEngine.revokePermission(sessionId, permission);
}

export function getLiveSessionMetrics(sessionId) {
  return heyLiveEngine.getMetrics(sessionId);
}

export function reconnectLiveSession(sessionId) {
  return heyLiveEngine.reconnectSession(sessionId);
}

export function subscribeToLive(listener) {
  return heyLiveEngine.subscribe(listener);
}

export { LIVE_STATES, LIVE_MODES, SOURCE_TYPES, OVERLAY_TYPES };

export default heyLiveEngine;