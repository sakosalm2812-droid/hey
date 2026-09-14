export const VOICE_STATES = {
  idle: "idle",
  listening: "listening",
  processing: "processing",
  speaking: "speaking",
  interrupted: "interrupted",
  muted: "muted",
  permissionRequired: "permission_required",
  error: "error",
  offline: "offline",
};

const transitions = {
  idle: ["listening", "muted", "permission_required", "offline", "error"],
  listening: ["processing", "idle", "interrupted", "muted", "permission_required", "offline", "error"],
  processing: ["speaking", "idle", "interrupted", "offline", "error"],
  speaking: ["idle", "interrupted", "processing", "muted", "error"],
  interrupted: ["idle", "listening", "processing", "error"],
  muted: ["idle", "permission_required", "offline", "error"],
  permission_required: ["idle", "listening", "error"],
  error: ["idle", "offline", "permission_required"],
  offline: ["idle", "error", "permission_required"],
};

export function createVoiceState(initialState = VOICE_STATES.idle) {
  if (!Object.values(VOICE_STATES).includes(initialState)) throw new TypeError("Unknown voice state.");
  let current = initialState;
  let updatedAt = new Date();

  return {
    get state() { return current; },
    get updatedAt() { return updatedAt; },
    transition(nextState) {
      if (!Object.values(VOICE_STATES).includes(nextState)) throw new TypeError("Unknown voice state.");
      if (nextState !== current && !transitions[current]?.includes(nextState)) {
        return { success: false, state: current, error: `Cannot transition voice from ${current} to ${nextState}.` };
      }
      current = nextState;
      updatedAt = new Date();
      return { success: true, state: current, updatedAt };
    },
    snapshot() { return { state: current, updatedAt }; },
  };
}

export default { VOICE_STATES, createVoiceState };
