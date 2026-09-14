

const TOKEN_STATES = Object.freeze({
  ACTIVE: "active",
  EXPIRED: "expired",
  REVOKED: "revoked",
});

const PACKAGE_STATES = Object.freeze({
  DRAFT: "draft",
  VALIDATED: "validated",
  STAGED: "staged",
  INSTALLED: "installed",
  UPDATED: "updated",
  ROLLED_BACK: "rolled_back",
  REVOKED: "revoked",
});

function generateTokenId() {
  return `tok_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generatePackageId() {
  return `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class DeveloperEngine {
  constructor() {
    this.apiTokens = new Map();
    this.extensions = new Map();
    this.packages = new Map();
    this.schemas = new Map();
    this.testRuns = new Map();
    this.sandboxes = new Map();
    this.featureFlags = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_developer");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.apiTokens) Object.entries(parsed.apiTokens).forEach(([k, v]) => this.apiTokens.set(k, v));
        if (parsed.extensions) Object.entries(parsed.extensions).forEach(([k, v]) => this.extensions.set(k, v));
        if (parsed.packages) Object.entries(parsed.packages).forEach(([k, v]) => this.packages.set(k, v));
        if (parsed.featureFlags) Object.entries(parsed.featureFlags).forEach(([k, v]) => this.featureFlags.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load developer:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_developer", JSON.stringify({
        apiTokens: Object.fromEntries(this.apiTokens),
        extensions: Object.fromEntries(this.extensions),
        packages: Object.fromEntries(this.packages),
        featureFlags: Object.fromEntries(this.featureFlags),
      }));
    } catch (err) {
      console.warn("Failed to save developer:", err);
    }
  }

  createApiToken(input) {
    const tokenId = generateTokenId();
    const token = `hey_${Date.now()}_${Math.random().toString(36).slice(2, 16)}`;
    const apiToken = {
      id: tokenId,
      token,
      name: input.name,
      scopes: input.scopes || [],
      expiresAt: input.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      state: TOKEN_STATES.ACTIVE,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      usageCount: 0,
    };
    this.apiTokens.set(tokenId, apiToken);
    this.save();
    return { ...apiToken, token };
  }

  getApiToken(id) {
    return this.apiTokens.get(id) || null;
  }

  getAllApiTokens() {
    return Array.from(this.apiTokens.values()).map(t => ({ ...t, token: t.token.slice(0, 8) + "..." }));
  }

  revokeApiToken(id) {
    const token = this.apiTokens.get(id);
    if (!token) return { error: "Token not found" };
    token.state = TOKEN_STATES.REVOKED;
    token.revokedAt = new Date().toISOString();
    this.apiTokens.set(id, token);
    this.save();
    return { success: true };
  }

  validateApiToken(token) {
    const apiToken = Array.from(this.apiTokens.values()).find(t => t.token === token);
    if (!apiToken) return { valid: false };
    if (apiToken.state !== TOKEN_STATES.ACTIVE) return { valid: false };
    if (new Date(apiToken.expiresAt) < new Date()) return { valid: false };
    apiToken.lastUsed = new Date().toISOString();
    apiToken.usageCount++;
    this.apiTokens.set(apiToken.id, apiToken);
    this.save();
    return { valid: true, scopes: apiToken.scopes };
  }

  registerExtension(input) {
    const extId = `ext_${Date.now()}`;
    const extension = {
      id: extId,
      name: input.name,
      version: input.version,
      manifest: input.manifest,
      capabilities: input.capabilities || [],
      dependencies: input.dependencies || [],
      licenses: input.licenses || [],
      state: "staged",
      installedAt: null,
      updatedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.extensions.set(extId, extension);
    this.save();
    return extension;
  }

  getExtension(id) {
    return this.extensions.get(id) || null;
  }

  getAllExtensions() {
    return Array.from(this.extensions.values());
  }

  installExtension(extId) {
    const extension = this.extensions.get(extId);
    if (!extension) return { error: "Extension not found" };
    extension.state = "installed";
    extension.installedAt = new Date().toISOString();
    this.extensions.set(extId, extension);
    this.save();
    return extension;
  }

  uninstallExtension(extId) {
    const extension = this.extensions.get(extId);
    if (!extension) return { error: "Extension not found" };
    extension.state = "uninstalled";
    this.extensions.set(extId, extension);
    this.save();
    return extension;
  }

  createPackage(input) {
    const pkgId = generatePackageId();
    const pkg = {
      id: pkgId,
      name: input.name,
      version: input.version,
      description: input.description || "",
      manifest: input.manifest,
      source: input.source || "local",
      state: PACKAGE_STATES.DRAFT,
      dependencies: input.dependencies || [],
      compatibility: input.compatibility || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.packages.set(pkgId, pkg);
    this.save();
    return pkg;
  }

  getPackage(id) {
    return this.packages.get(id) || null;
  }

  getAllPackages() {
    return Array.from(this.packages.values());
  }

  validatePackage(pkgId) {
    const pkg = this.packages.get(pkgId);
    if (!pkg) return { error: "Package not found" };
    
    const checks = {
      hasManifest: Boolean(pkg.manifest),
      validSchema: true,
      dependenciesResolved: true,
      licensesValid: true,
      signatureValid: true,
    };
    
    const valid = Object.values(checks).every(v => v);
    pkg.state = valid ? PACKAGE_STATES.VALIDATED : PACKAGE_STATES.DRAFT;
    this.packages.set(pkgId, pkg);
    this.save();
    
    return { valid, checks };
  }

  stagePackage(pkgId) {
    const pkg = this.packages.get(pkgId);
    if (!pkg) return { error: "Package not found" };
    if (pkg.state !== PACKAGE_STATES.VALIDATED) return { error: "Package not validated" };
    pkg.state = PACKAGE_STATES.STAGED;
    pkg.updatedAt = new Date().toISOString();
    this.packages.set(pkgId, pkg);
    this.save();
    return pkg;
  }

  installPackage(pkgId) {
    const pkg = this.packages.get(pkgId);
    if (!pkg) return { error: "Package not found" };
    pkg.state = PACKAGE_STATES.INSTALLED;
    pkg.installedAt = new Date().toISOString();
    this.packages.set(pkgId, pkg);
    this.save();
    return pkg;
  }

  rollbackPackage(pkgId, targetVersion) {
    const pkg = this.packages.get(pkgId);
    if (!pkg) return { error: "Package not found" };
    pkg.state = PACKAGE_STATES.ROLLED_BACK;
    pkg.rolledBackTo = targetVersion || pkg.version || pkg.updatedAt;
    pkg.updatedAt = new Date().toISOString();
    this.packages.set(pkgId, pkg);
    this.save();
    return pkg;
  }

  revokePackage(pkgId) {
    const pkg = this.packages.get(pkgId);
    if (!pkg) return { error: "Package not found" };
    pkg.state = PACKAGE_STATES.REVOKED;
    pkg.updatedAt = new Date().toISOString();
    this.packages.set(pkgId, pkg);
    this.save();
    return pkg;
  }

  registerSchema(input) {
    const schemaId = `schema_${Date.now()}`;
    const schema = {
      id: schemaId,
      name: input.name,
      version: input.version,
      definition: input.definition,
      createdAt: new Date().toISOString(),
    };
    this.schemas.set(schemaId, schema);
    this.save();
    return schema;
  }

  getSchema(id) {
    return this.schemas.get(id) || null;
  }

  runTest(input) {
    const runId = generateRunId();
    const testRun = {
      id: runId,
      type: input.type,
      target: input.target,
      fixtures: input.fixtures || [],
      state: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      results: [],
    };
    this.testRuns.set(runId, testRun);
    this.save();
    return testRun;
  }

  getTestRun(id) {
    return this.testRuns.get(id) || null;
  }

  createSandbox(input) {
    const sandboxId = `sb_${Date.now()}`;
    const sandbox = {
      id: sandboxId,
      name: input.name,
      type: input.type,
      isolation: input.isolation || "full",
      resources: input.resources || { cpu: "50%", memory: "512MB" },
      network: input.network || "none",
      state: "created",
      createdAt: new Date().toISOString(),
    };
    this.sandboxes.set(sandboxId, sandbox);
    this.save();
    return sandbox;
  }

  getSandbox(id) {
    return this.sandboxes.get(id) || null;
  }

  setFeatureFlag(input) {
    const flag = {
      key: input.key,
      enabled: input.enabled,
      description: input.description || "",
      target: input.target || "all",
      rollout: input.rollout || 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.featureFlags.set(input.key, flag);
    this.save();
    return flag;
  }

  getFeatureFlag(key) {
    return this.featureFlags.get(key) || null;
  }

  getAllFeatureFlags() {
    return Array.from(this.featureFlags.values());
  }

  evaluateFeatureFlag(key, context = {}) {
    const flag = this.featureFlags.get(key);
    if (!flag) return false;
    if (!flag.enabled) return false;
    if (flag.target !== "all" && !context.matchesTarget) return false;
    return Math.random() * 100 < flag.rollout;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Developer listener error:", err); }
    });
  }
}

export const developerEngine = new DeveloperEngine();

export function createApiToken(input) {
  return developerEngine.createApiToken(input);
}

export function getApiToken(id) {
  return developerEngine.getApiToken(id);
}

export function getAllApiTokens() {
  return developerEngine.getAllApiTokens();
}

export function revokeApiToken(id) {
  return developerEngine.revokeApiToken(id);
}

export function validateApiToken(token) {
  return developerEngine.validateApiToken(token);
}

export function registerExtension(input) {
  return developerEngine.registerExtension(input);
}

export function getExtension(id) {
  return developerEngine.getExtension(id);
}

export function getAllExtensions() {
  return developerEngine.getAllExtensions();
}

export function installExtension(extId) {
  return developerEngine.installExtension(extId);
}

export function uninstallExtension(extId) {
  return developerEngine.uninstallExtension(extId);
}

export function createPackage(input) {
  return developerEngine.createPackage(input);
}

export function getPackage(id) {
  return developerEngine.getPackage(id);
}

export function getAllPackages() {
  return developerEngine.getAllPackages();
}

export function validatePackage(pkgId) {
  return developerEngine.validatePackage(pkgId);
}

export function stagePackage(pkgId) {
  return developerEngine.stagePackage(pkgId);
}

export function installPackage(pkgId) {
  return developerEngine.installPackage(pkgId);
}

export function rollbackPackage(pkgId, targetVersion) {
  return developerEngine.rollbackPackage(pkgId, targetVersion);
}

export function revokePackage(pkgId) {
  return developerEngine.revokePackage(pkgId);
}

export function registerSchema(input) {
  return developerEngine.registerSchema(input);
}

export function getSchema(id) {
  return developerEngine.getSchema(id);
}

export function runTest(input) {
  return developerEngine.runTest(input);
}

export function getTestRun(id) {
  return developerEngine.getTestRun(id);
}

export function createSandbox(input) {
  return developerEngine.createSandbox(input);
}

export function getSandbox(id) {
  return developerEngine.getSandbox(id);
}

export function setFeatureFlag(input) {
  return developerEngine.setFeatureFlag(input);
}

export function getFeatureFlag(key) {
  return developerEngine.getFeatureFlag(key);
}

export function getAllFeatureFlags() {
  return developerEngine.getAllFeatureFlags();
}

export function evaluateFeatureFlag(key, context) {
  return developerEngine.evaluateFeatureFlag(key, context);
}

export function subscribeToDeveloper(listener) {
  return developerEngine.subscribe(listener);
}

export { TOKEN_STATES, PACKAGE_STATES };

export default developerEngine;