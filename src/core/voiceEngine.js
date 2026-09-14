import { publish } from "./eventBus.js";
import { recordAudit } from "./auditLog.js";
import { getSetting, setSetting } from "./settingsRegistry.js";

const VOICE_STATES = Object.freeze({
  IDLE: "idle",
  REQUESTING_PERMISSION: "requesting_permission",
  CALIBRATING: "calibrating",
  READY: "ready",
  LISTENING: "listening",
  TRANSCRIBING: "transcribing",
  PROCESSING: "processing",
  SPEAKING: "speaking",
  MUTED: "muted",
  ERROR: "error",
});

const ACTIVATION_MODES = Object.freeze({
  PUSH_TO_TALK: "push-to-talk",
  WAKE_WORD: "wake-word",
  HOLD_TO_TALK: "hold-to-talk",
  CLICK: "click",
});

const WAKE_WORD_STATES = Object.freeze({
  INACTIVE: "inactive",
  LISTENING: "listening",
  DETECTED: "detected",
  CONFIRMED: "confirmed",
  ERROR: "error",
});

function generateSessionId() {
  return `voice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class VoiceEngine {
  constructor() {
    this.sessions = new Map();
    this.wakeWordDetector = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.currentSession = null;
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_voice_settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([key, value]) => {
          setSetting(key, value, { source: "stored" });
        });
      }
    } catch (err) {
      console.warn("Failed to load voice settings:", err);
    }
  }

  async initializeSession(options = {}) {
    const sessionId = generateSessionId();
    const activationMode = options.activationMode || getSetting("voice.activation") || ACTIVATION_MODES.PUSH_TO_TALK;
    
    const session = {
      id: sessionId,
      state: VOICE_STATES.IDLE,
      activationMode,
      wakePhrase: options.wakePhrase || getSetting("voice.wake_phrase") || "HEY",
      language: options.language || getSetting("language.primary") || "en",
      voice: options.voice || null,
      rate: options.rate || getSetting("voice.rate") || 1.0,
      pitch: options.pitch || 1.0,
      volume: options.volume || 1.0,
      bargeIn: options.bargeIn !== undefined ? options.bargeIn : getSetting("voice.barge_in"),
      endpointMs: options.endpointMs || getSetting("voice.endpoint_ms") || 700,
      captureMuted: false,
      playbackMuted: false,
      deviceId: options.deviceId || null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      lastActivity: null,
      transcript: "",
      confidence: 0,
    };

    this.sessions.set(sessionId, session);
    this.notify("session_created", session);
    
    if (activationMode === ACTIVATION_MODES.WAKE_WORD) {
      await this.startWakeWordDetection(sessionId);
    }

    publish("voice.session_created", session);
    recordAudit({ action: "voice.session_created", status: "completed", metadata: { sessionId, activationMode } });
    
    return session;
  }

  getSession(id) {
    return this.sessions.get(id) || null;
  }

  getActiveSession() {
    return this.currentSession;
  }

  setActiveSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.currentSession = session;
    }
    return session;
  }

  async requestPermission(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    session.state = VOICE_STATES.REQUESTING_PERMISSION;
    this.notify("session_state_changed", session);

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: session.deviceId ? { exact: session.deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new AudioContext();
      session.state = VOICE_STATES.CALIBRATING;
      this.notify("session_state_changed", session);

      await this.calibrateAudio(sessionId);
      
      session.state = VOICE_STATES.READY;
      this.notify("session_state_changed", session);
      
      publish("voice.permission_granted", { sessionId });
      return { success: true };
    } catch (error) {
      session.state = VOICE_STATES.ERROR;
      session.error = error.message;
      this.notify("session_state_changed", session);
      return { error: error.message };
    }
  }

  async calibrateAudio(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !this.mediaStream) return;

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    return new Promise(resolve => {
      const checkLevel = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        
        if (average < 10) {
          resolve();
        } else {
          setTimeout(checkLevel, 100);
        }
      };
      checkLevel();
    });
  }

  async startListening(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== VOICE_STATES.READY) return { error: "Session not ready" };

    if (!this.mediaStream) {
      const permResult = await this.requestPermission(sessionId);
      if (permResult.error) return permResult;
    }

    session.state = VOICE_STATES.LISTENING;
    session.startedAt = new Date().toISOString();
    this.notify("session_state_changed", session);

    this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    this.recognition.lang = session.language;
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      let maxConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;
        
        if (result.isFinal) {
          finalTranscript += transcript;
          maxConfidence = Math.max(maxConfidence, confidence);
        } else {
          interimTranscript += transcript;
        }
      }

      session.transcript = finalTranscript || interimTranscript;
      session.confidence = maxConfidence;
      session.lastActivity = new Date().toISOString();
      this.notify("transcript_update", { sessionId, transcript: session.transcript, isFinal: !!finalTranscript, confidence: maxConfidence });
    };

    this.recognition.onend = () => {
      if (session.state === VOICE_STATES.LISTENING) {
        session.state = VOICE_STATES.PROCESSING;
        this.notify("session_state_changed", session);
        this.processTranscript(sessionId);
      }
    };

    this.recognition.onerror = (event) => {
      session.state = VOICE_STATES.ERROR;
      session.error = event.error;
      this.notify("session_state_changed", session);
    };

    this.recognition.start();
    return { success: true };
  }

  async stopListening(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !this.recognition) return { error: "Not listening" };

    this.recognition.stop();
    this.recognition = null;
    
    if (session.state === VOICE_STATES.LISTENING) {
      session.state = VOICE_STATES.PROCESSING;
      this.notify("session_state_changed", session);
      await this.processTranscript(sessionId);
    }
    
    return { success: true };
  }

  async processTranscript(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const transcript = session.transcript.trim();
    if (!transcript) {
      session.state = VOICE_STATES.READY;
      this.notify("session_state_changed", session);
      return;
    }

    session.state = VOICE_STATES.PROCESSING;
    this.notify("session_state_changed", session);

    publish("voice.transcript_ready", { sessionId, transcript, confidence: session.confidence });
    recordAudit({ action: "voice.transcript_ready", status: "completed", metadata: { sessionId, transcriptLength: transcript.length } });
    
    return { transcript, confidence: session.confidence };
  }

  async speak(sessionId, text, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    if (session.playbackMuted) return { error: "Playback muted" };

    session.state = VOICE_STATES.SPEAKING;
    this.notify("session_state_changed", session);

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.language || session.language;
      utterance.rate = options.rate || session.rate;
      utterance.pitch = options.pitch || session.pitch;
      utterance.volume = options.volume || session.volume;
      utterance.voice = this.getVoice(options.voice || session.voice);

      utterance.onstart = () => {
        publish("voice.speech_started", { sessionId, text });
      };

      utterance.onend = () => {
        session.state = VOICE_STATES.READY;
        session.lastActivity = new Date().toISOString();
        this.notify("session_state_changed", session);
        publish("voice.speech_ended", { sessionId });
        resolve({ success: true });
      };

      utterance.onerror = (event) => {
        session.state = VOICE_STATES.ERROR;
        session.error = event.error;
        this.notify("session_state_changed", session);
        resolve({ error: event.error });
      };

      this.synthesis.speak(utterance);
    });
  }

  getVoice(voiceName) {
    if (!voiceName) return null;
    const voices = this.synthesis.getVoices();
    return voices.find(v => v.name === voiceName || v.voiceURI === voiceName) || null;
  }

  getAvailableVoices() {
    return this.synthesis.getVoices().map(v => ({
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      default: v.default,
    }));
  }

  async startWakeWordDetection(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    session.wakeWordState = WAKE_WORD_STATES.LISTENING;
    
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        if (session.wakeWordState !== WAKE_WORD_STATES.LISTENING) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        const energy = inputData.reduce((sum, sample) => sum + sample * sample, 0) / inputData.length;
        
        if (energy > 0.01) {
          this.detectWakeWord(sessionId, inputData);
        }
      };

      source.connect(processor);
      processor.connect(this.audioContext.destination);

      return { success: true };
    } catch (error) {
      session.wakeWordState = WAKE_WORD_STATES.ERROR;
      session.error = error.message;
      return { error: error.message };
    }
  }

  detectWakeWord(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const wakePhrase = session.wakePhrase.toLowerCase();
    
    session.wakeWordState = WAKE_WORD_STATES.DETECTED;
    this.notify("wake_word_detected", { sessionId, phrase: wakePhrase });
    
    setTimeout(() => {
      session.wakeWordState = WAKE_WORD_STATES.CONFIRMED;
      this.notify("wake_word_confirmed", { sessionId });
      this.startListening(sessionId);
    }, 500);
  }

  stopWakeWordDetection(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.wakeWordState = WAKE_WORD_STATES.INACTIVE;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  bargeIn(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.bargeIn) return { error: "Barge-in disabled" };

    this.synthesis.cancel();
    session.state = VOICE_STATES.LISTENING;
    this.notify("session_state_changed", session);
    this.startListening(sessionId);
    
    publish("voice.barge_in", { sessionId });
    return { success: true };
  }

  muteCapture(sessionId, muted = true) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };
    
    session.captureMuted = muted;
    if (muted && this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(t => t.enabled = false);
    } else if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(t => t.enabled = true);
    }
    this.notify("session_state_changed", session);
    return { success: true, captureMuted: muted };
  }

  mutePlayback(sessionId, muted = true) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };
    
    session.playbackMuted = muted;
    if (muted) {
      this.synthesis.cancel();
    }
    this.notify("session_state_changed", session);
    return { success: true, playbackMuted: muted };
  }

  setDevice(sessionId, deviceId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };
    
    session.deviceId = deviceId;
    setSetting("voice.device_id", deviceId);
    this.notify("session_state_changed", session);
    return { success: true };
  }

  getAudioDevices() {
    return navigator.mediaDevices.enumerateDevices()
      .then(devices => devices.filter(d => d.kind === "audioinput").map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
      })));
  }

  async endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: "Session not found" };

    this.stopWakeWordDetection(sessionId);
    this.synthesis.cancel();
    
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    session.state = VOICE_STATES.IDLE;
    session.endedAt = new Date().toISOString();
    this.notify("session_ended", session);
    
    publish("voice.session_ended", { sessionId });
    recordAudit({ action: "voice.session_ended", status: "completed", metadata: { sessionId } });
    
    this.sessions.delete(sessionId);
    return { success: true };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Voice listener error:", err); }
    });
  }
}

export const voiceEngine = new VoiceEngine();

export function initializeVoiceSession(options) {
  return voiceEngine.initializeSession(options);
}

export function getVoiceSession(id) {
  return voiceEngine.getSession(id);
}

export function getActiveVoiceSession() {
  return voiceEngine.getActiveSession();
}

export function requestVoicePermission(sessionId) {
  return voiceEngine.requestPermission(sessionId);
}

export function startVoiceListening(sessionId) {
  return voiceEngine.startListening(sessionId);
}

export function stopVoiceListening(sessionId) {
  return voiceEngine.stopListening(sessionId);
}

export function speakVoice(sessionId, text, options) {
  return voiceEngine.speak(sessionId, text, options);
}

export function bargeInVoice(sessionId) {
  return voiceEngine.bargeIn(sessionId);
}

export function muteVoiceCapture(sessionId, muted) {
  return voiceEngine.muteCapture(sessionId, muted);
}

export function muteVoicePlayback(sessionId, muted) {
  return voiceEngine.mutePlayback(sessionId, muted);
}

export function setVoiceDevice(sessionId, deviceId) {
  return voiceEngine.setDevice(sessionId, deviceId);
}

export function getVoiceDevices() {
  return voiceEngine.getAudioDevices();
}

export function getAvailableVoices() {
  return voiceEngine.getAvailableVoices();
}

export function endVoiceSession(sessionId) {
  return voiceEngine.endSession(sessionId);
}

export function subscribeToVoice(listener) {
  return voiceEngine.subscribe(listener);
}

export { VOICE_STATES, ACTIVATION_MODES, WAKE_WORD_STATES };

export default voiceEngine;