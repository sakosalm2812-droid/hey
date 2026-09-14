import { recordAudit } from "./auditLog.js";

export const OS_CAPABILITIES = {
  systemInfo: "system.info",
  openUrl: "browser.open_url",
  screenshot: "screen.capture",
  activeWindow: "window.active",
  fileSystem: "filesystem.control",
  terminal: "terminal.execute",
  input: "input.control",
  camera: "camera.capture",
  microphone: "microphone.capture",
  geolocation: "location.read",
  clipboard: "clipboard.read",
  clipboardWrite: "clipboard.write",
  notifications: "notifications.send",
  share: "share.content",
  wakeLock: "screen.wakeLock",
  clipboardRead: "clipboard.read",
  vibration: "device.vibrate",
  deviceMotion: "sensor.motion",
  orientation: "sensor.orientation",
  battery: "battery.status",
  networkInfo: "network.info",
  fullscreen: "ui.fullscreen",
  screenOrientation: "screen.orientation",
};

export function unsupportedCapability(capability, platform = "web") {
  return {
    success: false,
    capability,
    platform,
    error: `Capability ${capability} is unavailable on ${platform}. Install a native HEY adapter to enable it.`,
    verified: false,
  };
}

export function createBrowserOSAdapter() {
  const wakeLockSentinel = { current: null };

  return {
    platform: "web",
    capabilities: [
      OS_CAPABILITIES.systemInfo,
      OS_CAPABILITIES.openUrl,
      OS_CAPABILITIES.screenshot,
      OS_CAPABILITIES.camera,
      OS_CAPABILITIES.microphone,
      OS_CAPABILITIES.geolocation,
      OS_CAPABILITIES.clipboard,
      OS_CAPABILITIES.clipboardWrite,
      OS_CAPABILITIES.notifications,
      OS_CAPABILITIES.share,
      OS_CAPABILITIES.wakeLock,
      OS_CAPABILITIES.vibration,
      OS_CAPABILITIES.deviceMotion,
      OS_CAPABILITIES.battery,
      OS_CAPABILITIES.networkInfo,
      OS_CAPABILITIES.fullscreen,
    ],

    async getSystemInfo() {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const battery = await (navigator.getBattery?.() || Promise.resolve(null));
      return {
        success: true,
        platform: "web",
        data: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          online: navigator.onLine,
          memoryGb: navigator.deviceMemory || null,
          cpuCores: navigator.hardwareConcurrency || null,
          connection: connection ? {
            effectiveType: connection.effectiveType || null,
            downlinkMbps: connection.downlink || null,
            rttMs: connection.rtt || null,
          } : null,
          battery: battery ? {
            level: battery.level,
            charging: battery.charging,
            chargingTime: battery.chargingTime,
            dischargingTime: battery.dischargingTime,
          } : null,
          touchSupport: "ontouchstart" in window,
          pointerEvents: "PointerEvent" in window,
          devicePixelRatio: window.devicePixelRatio || 1,
          screen: {
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight,
            orientation: screen.orientation?.type || null,
          },
        },
        verified: true,
      };
    },

    async openUrl({ url }) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return { success: false, error: "Only HTTP and HTTPS URLs can be opened from the browser.", verified: false };
        }
        const opened = window.open(parsed.href, "_blank", "noopener,noreferrer");
        return {
          success: Boolean(opened),
          url: parsed.href,
          verified: Boolean(opened),
          error: opened ? null : "The browser blocked the new tab or window.",
        };
      } catch {
        return { success: false, error: "Invalid URL.", verified: false };
      }
    },

    async captureScreen() {
      if (!navigator.mediaDevices?.getDisplayMedia) return unsupportedCapability(OS_CAPABILITIES.screenshot, "web");
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const track = stream.getVideoTracks()[0];
        const imageCapture = typeof ImageCapture !== "undefined" ? new ImageCapture(track) : null;
        let dataUrl = null;
        if (imageCapture) {
          const bitmap = await imageCapture.grabFrame();
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          dataUrl = canvas.toDataURL("image/png");
        }
        stream.getTracks().forEach((t) => t.stop());
        return { success: true, source: "display_capture", dataUrl, verified: true };
      } catch (err) {
        if (err.name === "NotAllowedError") {
          return { success: false, error: "Screen capture permission denied.", verified: false };
        }
        throw err;
      }
    },

    async captureCamera({ width = 640, height = 480, facingMode = "user" } = {}) {
      if (!navigator.mediaDevices?.getUserMedia) return unsupportedCapability(OS_CAPABILITIES.camera, "web");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: width }, height: { ideal: height }, facingMode },
          audio: false,
        });
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        const imageCapture = typeof ImageCapture !== "undefined" ? new ImageCapture(track) : null;
        let dataUrl = null;
        if (imageCapture) {
          const bitmap = await imageCapture.grabFrame();
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          dataUrl = canvas.toDataURL("image/png");
        }
        stream.getTracks().forEach((t) => t.stop());
        return {
          success: true,
          dataUrl,
          width: settings.width || width,
          height: settings.height || height,
          facingMode: settings.facingMode || facingMode,
          verified: true,
        };
      } catch (err) {
        if (err.name === "NotAllowedError") {
          return { success: false, error: "Camera permission denied by user.", verified: false };
        }
        return { success: false, error: err.message, verified: false };
      }
    },

    async startMicrophone({ echoCancellation = true, noiseSuppression = true } = {}) {
      if (!navigator.mediaDevices?.getUserMedia) return unsupportedCapability(OS_CAPABILITIES.microphone, "web");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation, noiseSuppression, autoGainControl: true },
        });
        const track = stream.getAudioTracks()[0];
        return { success: true, trackId: track.id, settings: track.getSettings(), verified: true };
      } catch (err) {
        if (err.name === "NotAllowedError") {
          return { success: false, error: "Microphone permission denied by user.", verified: false };
        }
        return { success: false, error: err.message, verified: false };
      }
    },

    async getGeolocation({ enableHighAccuracy = false, timeout = 10000 } = {}) {
      if (!("geolocation" in navigator)) return unsupportedCapability(OS_CAPABILITIES.geolocation, "web");
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            success: true,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            timestamp: pos.timestamp,
            verified: true,
          }),
          (err) => resolve({
            success: false,
            error: err.code === 1 ? "Geolocation permission denied." : err.message,
            verified: false,
          }),
          { enableHighAccuracy, timeout, maximumAge: 60000 },
        );
      });
    },

    async readClipboard() {
      if (!navigator.clipboard?.readText) return unsupportedCapability(OS_CAPABILITIES.clipboardRead, "web");
      try {
        const text = await navigator.clipboard.readText();
        return { success: true, text, verified: true };
      } catch {
        return { success: false, error: "Clipboard read permission denied.", verified: false };
      }
    },

    async writeClipboard({ text }) {
      if (!navigator.clipboard?.writeText) return unsupportedCapability(OS_CAPABILITIES.clipboardWrite, "web");
      if (typeof text !== "string") return { success: false, error: "Text must be a string.", verified: false };
      try {
        await navigator.clipboard.writeText(text);
        return { success: true, verified: true };
      } catch {
        return { success: false, error: "Clipboard write permission denied.", verified: false };
      }
    },

    async sendNotification({ title, body, icon, tag, requireInteraction = false } = {}) {
      if (!("Notification" in window)) return unsupportedCapability(OS_CAPABILITIES.notifications, "web");
      if (Notification.permission === "denied") {
        return { success: false, error: "Notifications are blocked by the browser.", verified: false };
      }
      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          return { success: false, error: "Notification permission denied by user.", verified: false };
        }
      }
      try {
        new Notification(title || "HEY", { body: body || "", icon, tag, requireInteraction });
        return { success: true, notificationId: tag || title, verified: true };
      } catch (err) {
        return { success: false, error: err.message, verified: false };
      }
    },

    async shareContent({ title, text, url }) {
      if (!navigator.share) return unsupportedCapability(OS_CAPABILITIES.share, "web");
      try {
        await navigator.share({ title: title || undefined, text: text || undefined, url: url || undefined });
        return { success: true, shared: true, verified: true };
      } catch (err) {
        if (err.name === "AbortError") return { success: false, error: "Share cancelled by user.", verified: false };
        return { success: false, error: err.message, verified: false };
      }
    },

    async requestWakeLock() {
      if (!("wakeLock" in navigator)) return unsupportedCapability(OS_CAPABILITIES.wakeLock, "web");
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        wakeLockSentinel.current = sentinel;
        sentinel.addEventListener("release", () => { wakeLockSentinel.current = null; });
        return { success: true, active: true, verified: true };
      } catch (err) {
        return { success: false, error: err.message, verified: false };
      }
    },

    async releaseWakeLock() {
      if (wakeLockSentinel.current) {
        await wakeLockSentinel.current.release();
        wakeLockSentinel.current = null;
        return { success: true, active: false, verified: true };
      }
      return { success: true, active: false, verified: true };
    },

    async vibrate({ pattern = [200] } = {}) {
      if (!("vibrate" in navigator)) return unsupportedCapability(OS_CAPABILITIES.vibration, "web");
      try {
        navigator.vibrate(pattern);
        return { success: true, verified: true };
      } catch {
        return { success: false, error: "Vibration failed.", verified: false };
      }
    },

    async getBattery() {
      if (!navigator.getBattery) return unsupportedCapability(OS_CAPABILITIES.battery, "web");
      try {
        const battery = await navigator.getBattery();
        return {
          success: true,
          level: battery.level,
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
          verified: true,
        };
      } catch {
        return { success: false, error: "Battery API unavailable.", verified: false };
      }
    },

    async getNetworkInfo() {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!conn) return unsupportedCapability(OS_CAPABILITIES.networkInfo, "web");
      return {
        success: true,
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData,
        online: navigator.onLine,
        verified: true,
      };
    },

    async requestFullscreen(element) {
      const el = element || document.documentElement;
      if (!el.requestFullscreen) return unsupportedCapability(OS_CAPABILITIES.fullscreen, "web");
      try {
        await el.requestFullscreen();
        return { success: true, fullscreen: true, verified: true };
      } catch {
        return { success: false, error: "Fullscreen request denied.", verified: false };
      }
    },

    async exitFullscreen() {
      if (!document.exitFullscreen) return unsupportedCapability(OS_CAPABILITIES.fullscreen, "web");
      try {
        await document.exitFullscreen();
        return { success: true, fullscreen: false, verified: true };
      } catch {
        return { success: false, error: "Could not exit fullscreen.", verified: false };
      }
    },

    async execute({ capability, input }) {
      const map = {
        "camera.capture": () => this.captureCamera(input),
        "microphone.capture": () => this.startMicrophone(input),
        "location.read": () => this.getGeolocation(input),
        "clipboard.read": () => this.readClipboard(),
        "clipboard.write": () => this.writeClipboard(input),
        "notifications.send": () => this.sendNotification(input),
        "share.content": () => this.shareContent(input),
        "screen.wakeLock": () => this.requestWakeLock(),
        "device.vibrate": () => this.vibrate(input),
        "battery.status": () => this.getBattery(),
        "network.info": () => this.getNetworkInfo(),
        "ui.fullscreen": () => this.requestFullscreen(),
        "ui.exitFullscreen": () => this.exitFullscreen(),
        "screen.capture": () => this.captureScreen(),
        "browser.open_url": () => this.openUrl(input),
        "system.info": () => this.getSystemInfo(),
      };
      const handler = map[capability];
      if (handler) return handler();
      return unsupportedCapability(capability, "web");
    },
  };
}

export function createNativeAdapter(platform, implementation = {}) {
  if (!["windows", "macos", "linux", "android", "ios"].includes(platform)) {
    throw new TypeError("Native platform must be windows, macos, linux, android, or ios.");
  }

  return {
    platform,
    capabilities: implementation.capabilities || [],
    ...implementation,
    async execute(request) {
      const handler = implementation[request.capability];
      if (typeof handler !== "function") return unsupportedCapability(request.capability, platform);
      try {
        const result = await handler(request.input || {}, request);
        recordAudit({ action: "os.adapter.executed", tool: request.capability, status: result?.success === false ? "failed" : "completed", metadata: { platform, verified: Boolean(result?.verified) } });
        return result;
      } catch (error) {
        return { success: false, capability: request.capability, platform, error: error instanceof Error ? error.message : String(error), verified: false };
      }
    },
  };
}

export default { OS_CAPABILITIES, unsupportedCapability, createBrowserOSAdapter, createNativeAdapter };
