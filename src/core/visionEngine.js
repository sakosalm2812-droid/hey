import { executeTool } from "./toolRegistry.js";
import { publish } from "./eventBus.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateImageInput(image) {
  if (!image || typeof image !== "object") return { valid: false, error: "An image input is required." };
  if (typeof image.data !== "string" || !image.data.trim()) return { valid: false, error: "Image data must be a non-empty string." };
  if (image.data.length > MAX_IMAGE_BYTES) return { valid: false, error: "Image data exceeds the 10MB limit." };
  if (image.mimeType && !/^image\/(jpeg|png|webp|gif)$/.test(image.mimeType)) return { valid: false, error: "Unsupported image format." };
  return { valid: true };
}

function unavailable(message, code = "VISION_UNAVAILABLE") {
  return { success: false, verified: false, status: "unavailable", code, message, provider: null };
}

export async function understandImage({ image, prompt = "Describe the important visible content.", provider } = {}) {
  const validation = validateImageInput(image);
  if (!validation.valid) return unavailable(validation.error, "INVALID_IMAGE");
  if (!provider || typeof provider.analyze !== "function") return unavailable("No vision provider is configured.", "VISION_PROVIDER_UNAVAILABLE");
  try {
    const observation = await provider.analyze({ image, prompt });
    if (!observation || observation.verified !== true || typeof observation.observation !== "object") {
      return unavailable("Vision provider returned an invalid or unverified observation.", "UNVERIFIED_VISION_RESULT");
    }
    return { success: true, verified: true, status: "completed", code: "OK", observation, provider: provider.id || "configured" };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error), "VISION_PROVIDER_ERROR");
  }
}

export async function inspectScreen({ provider, prompt, captureTool = executeTool } = {}) {
  publish("vision.capture.started", { prompt });
  const capture = await captureTool("computer.capture_screen", {}, { permissionScope: "account" });
  if (!capture?.success || capture?.result?.verified !== true) {
    return { success: false, verified: false, status: capture?.requiresConfirmation ? "permission_required" : "unavailable", code: "SCREEN_CAPTURE_UNAVAILABLE", message: capture?.error || "Screen capture did not produce a verified image." };
  }
  const image = capture.result.image || capture.result;
  publish("vision.capture.completed", { verified: true });
  return understandImage({ image, prompt, provider });
}

export default { validateImageInput, understandImage, inspectScreen };
