import { createBrowserSpeechProvider } from "./voiceProviders.js";

const MICROPHONE_PERMISSION_STATES = new Set(["granted", "denied", "prompt"]);

/** Read current dictation support without opening the microphone or prompting. */
export async function getDictationReadiness(environment = globalThis) {
  const supported = createBrowserSpeechProvider(environment) !== null;
  if (!supported) return { supported: false, permission: "unknown" };

  try {
    const permission = await environment?.navigator?.permissions?.query?.({ name: "microphone" });
    if (MICROPHONE_PERMISSION_STATES.has(permission?.state)) {
      return { supported: true, permission: permission.state };
    }
  } catch {
    // Permission state is optional and query failure must not start a prompt.
  }
  return { supported: true, permission: "unknown" };
}
