import { registerTool } from "./toolRegistry.js";
import {
  generateImage,
  generateVideo,
  generateAudio,
  generateMusic,
  getAvailableGenerationProviders,
  getDefaultProvider,
} from "../lib/generationProviders.js";

function unsupportedGeneration(capability) {
  return {
    success: false,
    result: null,
    error: `${capability} generation is not available in this environment. Configure a provider API key to enable.`,
    verified: false,
  };
}

function getProviderForCapability(capability) {
  const providers = getAvailableGenerationProviders(capability);
  if (providers.length === 0) return null;
  return getDefaultProvider(capability)?.id || providers[0].id;
}

export function registerGenerationTools() {
  registerTool("generation.image", async (input, _context) => {
    const provider = getProviderForCapability("image");
    if (!provider) return unsupportedGeneration("image");

    try {
      const result = await generateImage({
        prompt: input.prompt,
        model: input.model,
        provider,
        options: input.options,
      });
      return { success: true, result, verified: true };
    } catch (error) {
      return { success: false, result: null, error: error.message, verified: false };
    }
  }, {
    category: "generation",
    capabilities: ["generation.image"],
    permission: "generation.image",
    riskLevel: "high",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "Text prompt for image generation" },
        model: { type: "string", description: "Model to use (optional)" },
        options: {
          type: "object",
          properties: {
            n: { type: "number", description: "Number of images" },
            size: { type: "string", description: "Image size (e.g., 1024x1024)" },
            quality: { type: "string", description: "Quality level" },
          },
        },
      },
    },
    source: "generation_api",
  });

  registerTool("generation.video", async (input, _context) => {
    const provider = getProviderForCapability("video");
    if (!provider) return unsupportedGeneration("video");

    try {
      const result = await generateVideo({
        prompt: input.prompt,
        model: input.model,
        provider,
        image: input.image,
        options: input.options,
      });
      return { success: true, result, verified: true };
    } catch (error) {
      return { success: false, result: null, error: error.message, verified: false };
    }
  }, {
    category: "generation",
    capabilities: ["generation.video"],
    permission: "generation.video",
    riskLevel: "high",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "Text prompt for video generation" },
        model: { type: "string", description: "Model to use (optional)" },
        image: { type: "string", description: "Reference image URL for image-to-video (optional)" },
        options: {
          type: "object",
          properties: {
            frames: { type: "number", description: "Number of frames" },
            fps: { type: "number", description: "Frames per second" },
          },
        },
      },
    },
    source: "generation_api",
  });

  registerTool("generation.audio", async (input, _context) => {
    const provider = getProviderForCapability("audio");
    if (!provider) return unsupportedGeneration("audio");

    try {
      const result = await generateAudio({
        text: input.text,
        model: input.model,
        provider,
        voice: input.voice,
        options: input.options,
      });
      return { success: true, result, verified: true };
    } catch (error) {
      return { success: false, result: null, error: error.message, verified: false };
    }
  }, {
    category: "generation",
    capabilities: ["generation.audio"],
    permission: "generation.audio",
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Text to convert to speech" },
        model: { type: "string", description: "Model to use (optional)" },
        voice: { type: "string", description: "Voice to use (optional)" },
        options: {
          type: "object",
          properties: {
            format: { type: "string", description: "Audio format (mp3, wav, etc.)" },
            speed: { type: "number", description: "Speech speed multiplier" },
          },
        },
      },
    },
    source: "generation_api",
  });

  registerTool("generation.music", async (input, _context) => {
    const provider = getProviderForCapability("music");
    if (!provider) return unsupportedGeneration("music");

    try {
      const result = await generateMusic({
        prompt: input.prompt,
        model: input.model,
        provider,
        options: input.options,
      });
      return { success: true, result, verified: true };
    } catch (error) {
      return { success: false, result: null, error: error.message, verified: false };
    }
  }, {
    category: "generation",
    capabilities: ["generation.music"],
    permission: "generation.music",
    riskLevel: "high",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: { type: "string", description: "Text prompt for music generation" },
        model: { type: "string", description: "Model to use (optional)" },
        options: {
          type: "object",
          properties: {
            duration: { type: "number", description: "Duration in seconds" },
            temperature: { type: "number", description: "Creativity temperature" },
          },
        },
      },
    },
    source: "generation_api",
  });

  return [
    "generation.image",
    "generation.video",
    "generation.audio",
    "generation.music",
  ];
}

export default { registerGenerationTools };
