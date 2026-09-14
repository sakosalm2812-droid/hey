import { getSetting, setSetting } from "./settingsRegistry.js";

const LOCAL_STATES = Object.freeze({
  READY: "ready_local",
  MODEL_MISSING: "model_missing",
  DOWNLOADING: "downloading",
  VALIDATING: "validating",
  LOADING: "loading",
  WARMING: "warming",
  AVAILABLE: "available",
  RESOURCE_LIMITED: "resource_limited",
  UPDATE_AVAILABLE: "update_available",
  FAILED: "failed",
});

const MODEL_TYPES = Object.freeze({
  SPEECH_RECOGNITION: "speech_recognition",
  WAKE_WORD: "wake_word",
  TEXT_TO_SPEECH: "text_to_speech",
  LLM: "llm",
  VISION: "vision",
  EMBEDDING: "embedding",
});

const QUEUE_POLICIES = Object.freeze({
  NEVER: "never",
  USER_APPROVAL: "user_approval",
  ALWAYS: "always",
});

function generateModelPackId() {
  return `model_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateOutboxId() {
  return `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class OfflineEngine {
  constructor() {
    this.localRuntime = {
      state: LOCAL_STATES.READY,
      modelPacks: new Map(),
      resourceBudget: {
        cpu: 50,
        memory: 2048,
        storage: 5120,
        batteryFloor: getSetting("local.battery_floor") || 20,
      },
      cache: new Map(),
      outbox: [],
      lanCompute: { enabled: false, peers: [] },
    };
    this.listeners = new Set();
    this.load();
    this.startResourceMonitor();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_offline");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.localRuntime.state = parsed.state || this.localRuntime.state;
        if (parsed.modelPacks) Object.entries(parsed.modelPacks).forEach(([k, v]) => this.localRuntime.modelPacks.set(k, v));
        if (parsed.resourceBudget) this.localRuntime.resourceBudget = { ...this.localRuntime.resourceBudget, ...parsed.resourceBudget };
        if (parsed.outbox) this.localRuntime.outbox = parsed.outbox;
        if (parsed.lanCompute) this.localRuntime.lanCompute = parsed.lanCompute;
      }
    } catch (err) {
      console.warn("Failed to load offline engine:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_offline", JSON.stringify({
        state: this.localRuntime.state,
        modelPacks: Object.fromEntries(this.localRuntime.modelPacks),
        resourceBudget: this.localRuntime.resourceBudget,
        outbox: this.localRuntime.outbox,
        lanCompute: this.localRuntime.lanCompute,
      }));
    } catch (err) {
      console.warn("Failed to save offline engine:", err);
    }
  }

  startResourceMonitor() {
    setInterval(() => {
      if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
          if (battery.level * 100 < this.localRuntime.resourceBudget.batteryFloor) {
            this.notify("battery_low", { level: battery.level * 100, floor: this.localRuntime.resourceBudget.batteryFloor });
          }
        });
      }
    }, 60000);
  }

  getState() {
    return this.localRuntime.state;
  }

  setState(state) {
    if (!Object.values(LOCAL_STATES).includes(state)) return { error: "Invalid state" };
    this.localRuntime.state = state;
    this.save();
    this.notify("state_changed", { state });
    return { success: true };
  }

  getModelPacks() {
    return Array.from(this.localRuntime.modelPacks.values());
  }

  getModelPack(id) {
    return this.localRuntime.modelPacks.get(id) || null;
  }

  async installModelPack(input) {
    const packId = generateModelPackId();
    const pack = {
      id: packId,
      name: input.name,
      type: input.type,
      version: input.version,
      size: input.size,
      languages: input.languages || [],
      modalities: input.modalities || [],
      checksum: input.checksum,
      diskRequirement: input.diskRequirement,
      ramRequirement: input.ramRequirement,
      acceleratorRequirement: input.acceleratorRequirement,
      state: LOCAL_STATES.DOWNLOADING,
      downloadUrl: input.downloadUrl,
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.localRuntime.modelPacks.set(packId, pack);
    this.save();

    try {
      const response = await fetch(input.downloadUrl);
      const reader = response.body.getReader();
      const contentLength = +response.headers.get("Content-Length");
      let received = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        pack.progress = Math.round((received / contentLength) * 100);
        this.localRuntime.modelPacks.set(packId, pack);
        this.save();
      }

      const blob = new Blob(chunks);
      const checksum = await this.computeChecksum(blob);
      
      if (checksum !== input.checksum) {
        pack.state = LOCAL_STATES.FAILED;
        pack.error = "Checksum mismatch";
        this.localRuntime.modelPacks.set(packId, pack);
        this.save();
        return { error: "Checksum mismatch" };
      }

      pack.state = LOCAL_STATES.VALIDATING;
      this.localRuntime.modelPacks.set(packId, pack);
      this.save();

      const valid = await this.validateModelPack(blob, input.type);
      if (!valid) {
        pack.state = LOCAL_STATES.FAILED;
        pack.error = "Validation failed";
        this.localRuntime.modelPacks.set(packId, pack);
        this.save();
        return { error: "Validation failed" };
      }

      pack.state = LOCAL_STATES.AVAILABLE;
      pack.blob = blob;
      this.localRuntime.modelPacks.set(packId, pack);
      this.save();

      this.notify("model_pack_installed", pack);
      return pack;
    } catch (error) {
      pack.state = LOCAL_STATES.FAILED;
      pack.error = error.message;
      this.localRuntime.modelPacks.set(packId, pack);
      this.save();
      return { error: error.message };
    }
  }

  async computeChecksum(blob) {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async validateModelPack() {
    return true;
  }

  removeModelPack(id) {
    this.localRuntime.modelPacks.delete(id);
    this.save();
    return true;
  }

  getResourceBudget() {
    return this.localRuntime.resourceBudget;
  }

  setResourceBudget(budget) {
    this.localRuntime.resourceBudget = { ...this.localRuntime.resourceBudget, ...budget };
    setSetting("local.battery_floor", budget.batteryFloor);
    this.save();
    return this.localRuntime.resourceBudget;
  }

  getCache() {
    return Array.from(this.localRuntime.cache.values());
  }

  setCache(key, value, ttl = 86400000) {
    this.localRuntime.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
    this.save();
  }

  getCacheEntry(key) {
    const entry = this.localRuntime.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.localRuntime.cache.delete(key);
      this.save();
      return null;
    }
    return entry.value;
  }

  clearCache() {
    this.localRuntime.cache.clear();
    this.save();
  }

  getOutbox() {
    return this.localRuntime.outbox;
  }

  addToOutbox(input) {
    const outboxId = generateOutboxId();
    const item = {
      id: outboxId,
      type: input.type,
      payload: input.payload,
      destination: input.destination,
      priority: input.priority || "normal",
      requiresConsent: input.requiresConsent !== false,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    this.localRuntime.outbox.push(item);
    this.save();
    this.notify("outbox_added", item);
    return item;
  }

  processOutbox() {
    if (!navigator.onLine) return;
    if (this.localRuntime.outbox.length === 0) return;

    const item = this.localRuntime.outbox[0];
    if (item.requiresConsent && !this.hasUserConsent(item)) return;

    this.sendOutboxItem(item);
  }

  hasUserConsent() {
    return true;
  }

  async sendOutboxItem(item) {
    try {
      await fetch(item.destination, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });
      this.localRuntime.outbox.shift();
      this.save();
      this.notify("outbox_sent", item);
    } catch (error) {
      item.attempts++;
      item.lastError = error.message;
      if (item.attempts >= 3) {
        this.localRuntime.outbox.shift();
      }
      this.save();
    }
  }

  enableLANCompute(enabled) {
    this.localRuntime.lanCompute.enabled = enabled;
    this.save();
    return { success: true };
  }

  addLANPeer(peer) {
    this.localRuntime.lanCompute.peers.push({
      id: peer.id,
      name: peer.name,
      capabilities: peer.capabilities,
      lastSeen: new Date().toISOString(),
    });
    this.save();
  }

  removeLANPeer(peerId) {
    this.localRuntime.lanCompute.peers = this.localRuntime.lanCompute.peers.filter(p => p.id !== peerId);
    this.save();
  }

  getLANPeers() {
    return this.localRuntime.lanCompute.peers;
  }

  getQueuePolicy() {
    return getSetting("privacy.no_cloud") ? QUEUE_POLICIES.NEVER : QUEUE_POLICIES.USER_APPROVAL;
  }

  setQueuePolicy(policy) {
    if (!Object.values(QUEUE_POLICIES).includes(policy)) return { error: "Invalid policy" };
    return { success: true };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Offline listener error:", err); }
    });
  }
}

export const offlineEngine = new OfflineEngine();

export function getOfflineState() {
  return offlineEngine.getState();
}

export function setOfflineState(state) {
  return offlineEngine.setState(state);
}

export function getModelPacks() {
  return offlineEngine.getModelPacks();
}

export function getModelPack(id) {
  return offlineEngine.getModelPack(id);
}

export function installModelPack(input) {
  return offlineEngine.installModelPack(input);
}

export function removeModelPack(id) {
  return offlineEngine.removeModelPack(id);
}

export function getResourceBudget() {
  return offlineEngine.getResourceBudget();
}

export function setResourceBudget(budget) {
  return offlineEngine.setResourceBudget(budget);
}

export function getOfflineCache() {
  return offlineEngine.getCache();
}

export function setOfflineCache(key, value, ttl) {
  return offlineEngine.setCache(key, value, ttl);
}

export function getOfflineCacheEntry(key) {
  return offlineEngine.getCacheEntry(key);
}

export function clearOfflineCache() {
  return offlineEngine.clearCache();
}

export function getOutbox() {
  return offlineEngine.getOutbox();
}

export function addToOutbox(input) {
  return offlineEngine.addToOutbox(input);
}

export function processOutbox() {
  return offlineEngine.processOutbox();
}

export function enableLANCompute(enabled) {
  return offlineEngine.enableLANCompute(enabled);
}

export function addLANPeer(peer) {
  return offlineEngine.addLANPeer(peer);
}

export function removeLANPeer(peerId) {
  return offlineEngine.removeLANPeer(peerId);
}

export function getLANPeers() {
  return offlineEngine.getLANPeers();
}

export function getQueuePolicy() {
  return offlineEngine.getQueuePolicy();
}

export function setQueuePolicy(policy) {
  return offlineEngine.setQueuePolicy(policy);
}

export function subscribeToOffline(listener) {
  return offlineEngine.subscribe(listener);
}

export { LOCAL_STATES, MODEL_TYPES, QUEUE_POLICIES };

export default offlineEngine;