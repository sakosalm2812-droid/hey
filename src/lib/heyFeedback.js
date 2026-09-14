const MUTE_KEY = "hey_feedback_muted";

function muted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFeedbackMuted(value) {
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    return false;
  }
}

export function isFeedbackMuted() {
  return muted();
}

const MS = {
  light: 12,
  medium: 25,
  heavy: 40,
};

export function buzz(level = "light") {
  if (muted()) return;
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(MS[level] ?? MS.light);
  } catch {
    return;
  }
}

let ctx = null;

function tone(freq, startDelay, duration, type = "sine", gain = 0.05) {
  if (muted()) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t0 = ctx.currentTime + startDelay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch {
    return;
  }
}

export function tapSound() {
  tone(440, 0, 0.07, "sine", 0.045);
}

export function confirmSound() {
  tone(523, 0, 0.09, "sine", 0.05);
  tone(659, 0.07, 0.12, "sine", 0.045);
}

export function errorSound() {
  tone(220, 0, 0.14, "triangle", 0.05);
}