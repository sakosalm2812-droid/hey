/**
 * Client bridge to HEY Vision.
 *
 * The vision model runs server-side through the
 * HEY edge function; this module owns the client
 * contract and exposes a provider object matching
 * `core/visionEngine`'s expectations.
 */

import { supabase } from "./supabase.js";

const VISION_MAX_BYTES = 8 * 1024 * 1024;

export function getHEYApiUrl() {
  return import.meta.env.VITE_HEY_API_URL ||
    (import.meta.env.VITE_SUPABASE_URL
      ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hey`
      : "/api/hey");
}

/**
 * Send an image to the HEY edge function for a
 * verified vision analysis.
 */
export async function describeImage(imageData, prompt = "", requestId = crypto.randomUUID()) {
  if (typeof imageData !== "string" || !imageData.startsWith("data:image/")) {
    throw new Error("A data-image URL is required.");
  }
  if (imageData.length > VISION_MAX_BYTES) {
    throw new Error("Image is too large for HEY Vision.");
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sign in to use HEY Vision.");
  }

  const response = await fetch(getHEYApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      operation: "vision",
      requestId,
      image: imageData,
      prompt,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "HEY Vision could not analyse the image.");
  }
  return data;
}

/**
 * Build a visionEngine-compatible provider backed
 * by the HEY edge function.
 */
export function createHeyVisionProvider() {
  return {
    id: "hey-vision",
    async analyze({ image, prompt }) {
      const result = await describeImage(image?.data || image, prompt);

      return {
        verified: true,
        observation: {
          text: Array.isArray(result.observation?.text)
            ? result.observation.text
            : [String(result.observation?.summary || "")],
          summary: result.observation?.summary || "",
          analysedAt: result.observation?.analysedAt || new Date().toISOString(),
        },
        metadata: {
          model: result.model,
          provider: result.provider,
        },
      };
    },
  };
}

/**
 * Turn an <input type="file"> (or drag/drop) value
 * into a compact data-image URL.
 */
export async function fileToDataUrl(file, maxBytes = VISION_MAX_BYTES) {
  if (!file) return null;
  if (file.size > maxBytes) {
    throw new Error("That image is too large for HEY Vision.");
  }
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
    throw new Error("HEY Vision only accepts JPEG, PNG, WebP or GIF images.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

export default { describeImage, createHeyVisionProvider, fileToDataUrl };