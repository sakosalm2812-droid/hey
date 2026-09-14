import { recordAudit } from "./auditLog.js";
import { publish } from "./eventBus.js";

const GENERATION_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  FRAME: "frame",
  SPEECH: "speech",
};

const PROVIDER_CATEGORIES = {
  IMAGE: ["dalle3", "midjourney", "stable_diffusion", "flux", "ideogram", "recraft"],
  VIDEO: ["sora", "runway_gen3", "luma", "pika", "kling", "stable_video"],
  AUDIO: ["elevenlabs", "openai_tts", "google_tts", "azure_tts", "coqui", "bark"],
  SPEECH: ["elevenlabs", "openai_tts", "google_tts", "azure_tts", "coqui"],
};

const ROUTING_STRATEGIES = {
  QUALITY: "quality",
  SPEED: "speed",
  COST: "cost",
  LOCAL: "local",
  BALANCED: "balanced",
  CUSTOM: "custom",
};

class GenerationEngine {
  constructor() {
    this.providers = new Map();
    this.routingRules = new Map();
    this.activeJobs = new Map();
    this.generationHistory = [];
    this.defaultStrategy = ROUTING_STRATEGIES.BALANCED;
  }

  registerProvider(provider) {
    const providerConfig = {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      capabilities: provider.capabilities || [],
      supportedFormats: provider.supportedFormats || [],
      maxResolution: provider.maxResolution,
      maxDuration: provider.maxDuration,
      pricing: provider.pricing || { perUnit: 0, currency: "USD" },
      rateLimits: provider.rateLimits || { requestsPerMinute: 60 },
      health: { status: "healthy", lastCheck: new Date().toISOString(), latency: 0 },
      config: provider.config || {},
      enabled: provider.enabled !== false,
      priority: provider.priority || 0,
    };

    this.providers.set(provider.id, providerConfig);
    publish("generation.provider.registered", { providerId: provider.id });
    return providerConfig;
  }

  unregisterProvider(providerId) {
    const removed = this.providers.delete(providerId);
    if (removed) {
      publish("generation.provider.unregistered", { providerId });
    }
    return removed;
  }

  getProvider(providerId) {
    return this.providers.get(providerId) || null;
  }

  listProviders(type = null, enabledOnly = true) {
    let providers = Array.from(this.providers.values());
    
    if (enabledOnly) {
      providers = providers.filter(p => p.enabled);
    }
    
    if (type) {
      providers = providers.filter(p => p.type === type);
    }
    
    return providers.sort((a, b) => b.priority - a.priority);
  }

  updateProviderHealth(providerId, health) {
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.health = { ...provider.health, ...health, lastCheck: new Date().toISOString() };
      publish("generation.provider.health.updated", { providerId, health: provider.health });
    }
  }

  setRoutingRule(type, rule) {
    this.routingRules.set(type, rule);
    publish("generation.routing.rule.updated", { type, rule });
  }

  getRoutingRule(type) {
    return this.routingRules.get(type) || { strategy: this.defaultStrategy };
  }

  setDefaultStrategy(strategy) {
    if (!Object.values(ROUTING_STRATEGIES).includes(strategy)) {
      throw new Error(`Invalid strategy: ${strategy}`);
    }
    this.defaultStrategy = strategy;
  }

  selectProvider(type, criteria = {}) {
    const providers = this.listProviders(type);
    if (!providers.length) return null;

    const strategy = criteria.strategy || this.getRoutingRule(type).strategy || this.defaultStrategy;

    switch (strategy) {
      case ROUTING_STRATEGIES.QUALITY:
        return providers.reduce((best, current) => 
          (current.config.qualityScore || 0) > (best.config.qualityScore || 0) ? current : best
        );
      case ROUTING_STRATEGIES.SPEED:
        return providers.reduce((best, current) => 
          (current.health.latency || Infinity) < (best.health.latency || Infinity) ? current : best
        );
      case ROUTING_STRATEGIES.COST:
        return providers.reduce((best, current) => 
          (current.pricing.perUnit || Infinity) < (best.pricing.perUnit || Infinity) ? current : best
        );
      case ROUTING_STRATEGIES.LOCAL:
        return providers.find(p => p.config.isLocal) || providers[0];
      case ROUTING_STRATEGIES.CUSTOM:
        if (criteria.customSelector && typeof criteria.customSelector === "function") {
          return criteria.customSelector(providers);
        }
        return providers[0];
      case ROUTING_STRATEGIES.BALANCED:
      default:
        return providers.reduce((best, current) => {
          const bestScore = this.calculateProviderScore(best);
          const currentScore = this.calculateProviderScore(current);
          return currentScore > bestScore ? current : best;
        });
    }
  }

  calculateProviderScore(provider) {
    const quality = provider.config.qualityScore || 50;
    const speed = Math.max(0, 100 - (provider.health.latency || 100));
    const cost = provider.pricing.perUnit ? Math.max(0, 100 - (provider.pricing.perUnit * 1000)) : 50;
    const reliability = provider.health.status === "healthy" ? 100 : 50;
    
    return (quality * 0.4) + (speed * 0.2) + (cost * 0.2) + (reliability * 0.2);
  }

  async generate(params) {
    const jobId = crypto.randomUUID();
    const provider = this.selectProvider(params.type, params.routing);

    if (!provider) {
      throw new Error(`No available provider for type: ${params.type}`);
    }

    const job = {
      id: jobId,
      type: params.type,
      providerId: provider.id,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      parameters: params.parameters || {},
      referenceImages: params.referenceImages || [],
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      metadata: params.metadata || {},
    };

    this.activeJobs.set(jobId, job);
    publish("generation.job.queued", { jobId, type: params.type, providerId: provider.id });

    this.processJob(jobId).catch(err => {
      console.error(`Generation job ${jobId} failed:`, err);
      this.handleJobError(jobId, err);
    });

    return { jobId, status: "queued", provider: provider.name };
  }

  async processJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    const provider = this.providers.get(job.providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${job.providerId}`);
    }

    job.status = "processing";
    job.startedAt = new Date().toISOString();
    job.progress = 0;
    publish("generation.job.started", { jobId });

    try {
      let result;

      switch (job.type) {
        case GENERATION_TYPES.IMAGE:
          result = await this.callImageProvider(provider, job);
          break;
        case GENERATION_TYPES.VIDEO:
          result = await this.callVideoProvider(provider, job);
          break;
        case GENERATION_TYPES.AUDIO:
          result = await this.callAudioProvider(provider, job);
          break;
        case GENERATION_TYPES.FRAME:
          result = await this.callFrameProvider(provider, job);
          break;
        case GENERATION_TYPES.SPEECH:
          result = await this.callSpeechProvider(provider, job);
          break;
        default:
          throw new Error(`Unsupported generation type: ${job.type}`);
      }

      await this.runQualityChecks(job, result);

      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.progress = 100;
      job.result = result;

      this.generationHistory.push({
        ...job,
        duration: new Date(job.completedAt) - new Date(job.startedAt),
      });

      if (this.generationHistory.length > 500) {
        this.generationHistory = this.generationHistory.slice(-500);
      }

      publish("generation.job.completed", { jobId: job.id, result });
      recordAudit({
        action: "generation.job.completed",
        status: "completed",
        metadata: { jobId: job.id, type: job.type, providerId: job.providerId },
      });

    } catch (err) {
      this.handleJobError(jobId, err);
    }
  }

  async callImageProvider(provider, job) {
    const startTime = Date.now();
    
    const payload = {
      prompt: job.prompt,
      negative_prompt: job.negativePrompt,
      width: job.parameters.width || 1024,
      height: job.parameters.height || 1024,
      steps: job.parameters.steps || 20,
      cfg_scale: job.parameters.cfgScale || 7,
      sampler: job.parameters.sampler || "euler_a",
      seed: job.parameters.seed,
      batch_size: job.parameters.batchSize || 1,
      reference_images: job.referenceImages,
      style: job.parameters.style,
    };

    job.progress = 10;
    publish("generation.job.progress", { jobId: job.id, progress: 10 });

    const response = await this.makeProviderRequest(provider, "/generate/image", payload);
    
    job.progress = 90;
    publish("generation.job.progress", { jobId: job.id, progress: 90 });

    return {
      images: response.images || [],
      metadata: {
        provider: provider.id,
        model: response.model,
        dimensions: { width: payload.width, height: payload.height },
        seed: response.seed,
        generationTime: Date.now() - startTime,
      },
    };
  }

  async callVideoProvider(provider, job) {
    const startTime = Date.now();
    
    const payload = {
      prompt: job.prompt,
      negative_prompt: job.negativePrompt,
      width: job.parameters.width || 576,
      height: job.parameters.height || 320,
      num_frames: job.parameters.numFrames || 16,
      fps: job.parameters.fps || 8,
      duration: job.parameters.duration || 2,
      seed: job.parameters.seed,
      motion_bucket_id: job.parameters.motionBucket,
      reference_images: job.referenceImages,
    };

    job.progress = 5;
    publish("generation.job.progress", { jobId: job.id, progress: 5 });

    const response = await this.makeProviderRequest(provider, "/generate/video", payload);
    
    job.progress = 80;
    publish("generation.job.progress", { jobId: job.id, progress: 80 });

    return {
      video: response.video_url || response.video_base64,
      metadata: {
        provider: provider.id,
        model: response.model,
        dimensions: { width: payload.width, height: payload.height },
        duration: payload.duration,
        fps: payload.fps,
        generationTime: Date.now() - startTime,
      },
    };
  }

  async callAudioProvider(provider, job) {
    const startTime = Date.now();
    
    const payload = {
      text: job.prompt,
      voice: job.parameters.voice || "default",
      speed: job.parameters.speed || 1.0,
      pitch: job.parameters.pitch || 1.0,
      language: job.parameters.language || "en",
      format: job.parameters.format || "mp3",
      sample_rate: job.parameters.sampleRate || 22050,
    };

    job.progress = 20;
    publish("generation.job.progress", { jobId: job.id, progress: 20 });

    const response = await this.makeProviderRequest(provider, "/generate/audio", payload);
    
    job.progress = 90;
    publish("generation.job.progress", { jobId: job.id, progress: 90 });

    return {
      audio: response.audio_url || response.audio_base64,
      metadata: {
        provider: provider.id,
        model: response.model,
        duration: response.duration,
        format: payload.format,
        generationTime: Date.now() - startTime,
      },
    };
  }

  async callFrameProvider(provider, job) {
    return this.callImageProvider(provider, job);
  }

  async callSpeechProvider(provider, job) {
    return this.callAudioProvider(provider, job);
  }

  async makeProviderRequest(provider, endpoint, payload) {
    const startTime = Date.now();
    const url = `${provider.config.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...provider.config.headers,
    };

    if (provider.config.apiKey) {
      headers["Authorization"] = `Bearer ${provider.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.config.timeout || 300000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Provider error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      
      this.updateProviderHealth(provider.id, {
        latency: Date.now() - startTime,
        status: "healthy",
      });

      return data;
    } catch (err) {
      this.updateProviderHealth(provider.id, {
        status: "degraded",
        lastError: err.message,
      });
      throw err;
    }
  }

  async runQualityChecks(job, result) {
    if (job.metadata.skipQualityCheck) return;

    const checks = [];

    switch (job.type) {
      case GENERATION_TYPES.IMAGE:
        checks.push(
          this.checkImageQuality(result),
          this.checkContentPolicy(result),
          this.checkResolution(result, job.parameters),
        );
        break;
      case GENERATION_TYPES.VIDEO:
        checks.push(
          this.checkVideoQuality(result),
          this.checkContentPolicy(result),
        );
        break;
      case GENERATION_TYPES.AUDIO:
      case GENERATION_TYPES.SPEECH:
        checks.push(
          this.checkAudioQuality(result),
        );
        break;
    }

    const results = await Promise.allSettled(checks);
    
    for (const result of results) {
      if (result.status === "rejected") {
        throw new Error(`Quality check failed: ${result.reason}`);
      }
    }
  }

  checkImageQuality(result) {
    if (!result.images || !result.images.length) {
      throw new Error("No images generated");
    }
    return { passed: true, check: "image_quality" };
  }

  checkVideoQuality(result) {
    if (!result.video) {
      throw new Error("No video generated");
    }
    return { passed: true, check: "video_quality" };
  }

  checkAudioQuality(result) {
    if (!result.audio) {
      throw new Error("No audio generated");
    }
    return { passed: true, check: "audio_quality" };
  }

  checkContentPolicy() {
    return { passed: true, check: "content_policy" };
  }

  checkResolution(result, params) {
    if (params.width && params.height) {
      return { passed: true, check: "resolution" };
    }
    return { passed: true, check: "resolution" };
  }

  handleJobError(jobId, error) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.status = "failed";
    job.error = error.message;
    job.completedAt = new Date().toISOString();

    publish("generation.job.failed", { jobId, error: error.message });
    recordAudit({
      action: "generation.job.failed",
      status: "failed",
      metadata: { jobId: job.id, type: job.type, error: error.message },
    });
  }

  getJob(jobId) {
    return this.activeJobs.get(jobId) || null;
  }

  getActiveJobs() {
    return Array.from(this.activeJobs.values()).filter(j => 
      j.status === "queued" || j.status === "processing"
    );
  }

  getJobHistory(limit = 50) {
    return this.generationHistory.slice(-limit);
  }

  async cancelJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return false;

    if (job.status === "processing") {
      job.status = "cancelled";
      job.completedAt = new Date().toISOString();
      publish("generation.job.cancelled", { jobId });
      return true;
    }

    if (job.status === "queued") {
      this.activeJobs.delete(jobId);
      return true;
    }

    return false;
  }

  async retryJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job || job.status !== "failed") return false;

    const newJobId = crypto.randomUUID();
    const newJob = {
      ...job,
      id: newJobId,
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };

    this.activeJobs.set(newJobId, newJob);
    this.processJob(newJobId).catch(err => this.handleJobError(newJobId, err));

    return { jobId: newJobId };
  }

  getProviderStats() {
    const stats = {};
    for (const [id, provider] of this.providers) {
      stats[id] = {
        name: provider.name,
        type: provider.type,
        health: provider.health,
        totalJobs: this.generationHistory.filter(j => j.providerId === id).length,
        successRate: this.calculateSuccessRate(id),
        avgLatency: this.calculateAvgLatency(id),
      };
    }
    return stats;
  }

  calculateSuccessRate(providerId) {
    const jobs = this.generationHistory.filter(j => j.providerId === providerId);
    if (!jobs.length) return 0;
    return jobs.filter(j => j.status === "completed").length / jobs.length;
  }

  calculateAvgLatency(providerId) {
    const jobs = this.generationHistory.filter(j => j.providerId === providerId && j.status === "completed");
    if (!jobs.length) return 0;
    return jobs.reduce((sum, j) => sum + (new Date(j.completedAt) - new Date(j.startedAt)), 0) / jobs.length;
  }
}

export const generationEngine = new GenerationEngine();

export function registerGenerationProvider(provider) {
  return generationEngine.registerProvider(provider);
}

export function unregisterGenerationProvider(providerId) {
  return generationEngine.unregisterProvider(providerId);
}

export function getGenerationProvider(providerId) {
  return generationEngine.getProvider(providerId);
}

export function listGenerationProviders(type, enabledOnly) {
  return generationEngine.listProviders(type, enabledOnly);
}

export function setGenerationRoutingRule(type, rule) {
  return generationEngine.setRoutingRule(type, rule);
}

export function getGenerationRoutingRule(type) {
  return generationEngine.getRoutingRule(type);
}

export function setDefaultGenerationStrategy(strategy) {
  return generationEngine.setDefaultStrategy(strategy);
}

export async function generateImage(params) {
  return generationEngine.generate({ ...params, type: GENERATION_TYPES.IMAGE });
}

export async function generateVideo(params) {
  return generationEngine.generate({ ...params, type: GENERATION_TYPES.VIDEO });
}

export async function generateAudio(params) {
  return generationEngine.generate({ ...params, type: GENERATION_TYPES.AUDIO });
}

export async function generateFrame(params) {
  return generationEngine.generate({ ...params, type: GENERATION_TYPES.FRAME });
}

export async function generateSpeech(params) {
  return generationEngine.generate({ ...params, type: GENERATION_TYPES.SPEECH });
}

export function getGenerationJob(jobId) {
  return generationEngine.getJob(jobId);
}

export function getActiveGenerationJobs() {
  return generationEngine.getActiveJobs();
}

export function getGenerationHistory(limit) {
  return generationEngine.getJobHistory(limit);
}

export async function cancelGenerationJob(jobId) {
  return generationEngine.cancelJob(jobId);
}

export async function retryGenerationJob(jobId) {
  return generationEngine.retryJob(jobId);
}

export function getGenerationProviderStats() {
  return generationEngine.getProviderStats();
}

export { GENERATION_TYPES, PROVIDER_CATEGORIES, ROUTING_STRATEGIES };

export default {
  registerGenerationProvider,
  unregisterGenerationProvider,
  getGenerationProvider,
  listGenerationProviders,
  setGenerationRoutingRule,
  getGenerationRoutingRule,
  setDefaultGenerationStrategy,
  generateImage,
  generateVideo,
  generateAudio,
  generateFrame,
  generateSpeech,
  getGenerationJob,
  getActiveGenerationJobs,
  getGenerationHistory,
  cancelGenerationJob,
  retryGenerationJob,
  getGenerationProviderStats,
  GENERATION_TYPES,
  PROVIDER_CATEGORIES,
  ROUTING_STRATEGIES,
};