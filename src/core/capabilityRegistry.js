import { unsupportedCapability } from "./osAdapter.js";

const capabilities = new Map();

export const CAPABILITY_STATUS = {
  supported: "supported",
  unsupported: "unsupported",
  permissionRequired: "permission_required",
  restricted: "restricted",
};

const ALL_PLATFORMS = ["web", "windows", "macos", "linux", "android", "ios"];
const VALID_STATUSES = new Set(Object.values(CAPABILITY_STATUS));
const MAX_METADATA_NODES = 512;
const MAX_METADATA_DEPTH = 12;
const MAX_DEPENDENCIES = 16;
const MAX_DEPENDENCY_DEPTH = 32;
const MAX_RUNTIME_FEATURES = 32;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/u;
const CAPABILITY_ID = /^[A-Za-z0-9]+(?:[._:/-][A-Za-z0-9]+)*$/u;

function snapshotPlainData(value, label = "Capability metadata", ancestors = new WeakSet(), budget = { nodes: 0 }, depth = 0) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > 2048) throw new TypeError(`${label} contains oversized text.`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number.`);
    return value;
  }
  if (typeof value !== "object") throw new TypeError(`${label} must contain only plain data values.`);
  if (depth >= MAX_METADATA_DEPTH) throw new TypeError(`${label} exceeds the supported nesting depth.`);
  if (ancestors.has(value)) throw new TypeError(`${label} cannot contain cycles.`);

  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must contain only plain objects and arrays.`);
  }
  ancestors.add(value);
  const result = isArray ? [] : {};
  const keys = Reflect.ownKeys(value);
  if (keys.length > 128) throw new TypeError(`${label} contains too many properties.`);
  for (const key of keys) {
    if (isArray && key === "length") continue;
    if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) {
      throw new TypeError(`${label} contains an unsupported property.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label} cannot contain accessors or hidden properties.`);
    }
    budget.nodes += 1;
    if (budget.nodes > MAX_METADATA_NODES) throw new TypeError(`${label} exceeds the supported size.`);
    if (isArray) {
      if (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
        throw new TypeError(`${label} arrays cannot contain custom properties.`);
      }
      result.push(snapshotPlainData(descriptor.value, label, ancestors, budget, depth + 1));
    } else {
      result[key] = snapshotPlainData(descriptor.value, label, ancestors, budget, depth + 1);
    }
  }
  if (isArray && result.length !== value.length) throw new TypeError(`${label} arrays cannot be sparse.`);
  ancestors.delete(value);
  return result;
}

function requireIdentifier(value, label) {
  if (typeof value !== "string" || value.length > 160 || !CAPABILITY_ID.test(value)) throw new TypeError(`${label} is invalid.`);
  return value;
}

function parseSemver(value, label) {
  if (typeof value !== "string" || value.length > 128) throw new TypeError(`${label} must be a semantic version.`);
  const match = value.match(SEMVER);
  if (!match) throw new TypeError(`${label} must be a semantic version.`);
  const prerelease = match[4]?.split(".") || [];
  if (prerelease.some((part) => /^\d+$/u.test(part) && part.length > 1 && part.startsWith("0"))) {
    throw new TypeError(`${label} must follow semantic version rules.`);
  }
  return { major: BigInt(match[1]), minor: BigInt(match[2]), patch: BigInt(match[3]), prerelease };
}

function compareSemver(left, right) {
  const a = parseSemver(left, "Runtime version");
  const b = parseSemver(right, "Minimum runtime version");
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const av = a.prerelease[index];
    const bv = b.prerelease[index];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av === bv) continue;
    const an = /^\d+$/u.test(av);
    const bn = /^\d+$/u.test(bv);
    if (an && bn) return BigInt(av) < BigInt(bv) ? -1 : 1;
    if (an !== bn) return an ? -1 : 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}

function normalizeStringList(value, { label, maxLength, pattern = IDENTIFIER } = {}) {
  if (!Array.isArray(value) || value.length > maxLength || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be a bounded plain array.`);
  }
  const values = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label} cannot be sparse or use accessors.`);
    if (typeof descriptor.value !== "string" || !pattern.test(descriptor.value)) throw new TypeError(`${label} contains an invalid value.`);
    if (values.includes(descriptor.value)) throw new TypeError(`${label} must not contain duplicates.`);
    values.push(descriptor.value);
  }
  if (Reflect.ownKeys(value).some((key) => key !== "length" && !(typeof key === "string" && /^(0|[1-9]\d*)$/u.test(key) && Number(key) < value.length))) {
    throw new TypeError(`${label} cannot contain custom array properties.`);
  }
  return values;
}

function normalizeCapability(input) {
  const capability = snapshotPlainData(input);
  if (!capability || Array.isArray(capability)) throw new TypeError("A capability must be a plain object.");
  const id = requireIdentifier(capability.id, "Capability id");
  if (typeof capability.name !== "string" || !capability.name.trim() || capability.name.length > 160 ||
      [...capability.name].some((character) => character.codePointAt(0) < 0x20 || character.codePointAt(0) === 0x7f)) {
    throw new TypeError("Capability name is invalid.");
  }

  const hasLegacyPlatforms = Object.hasOwn(capability, "platforms");
  const hasSupportedPlatforms = Object.hasOwn(capability, "supportedPlatforms");
  const legacyPlatforms = hasLegacyPlatforms ? normalizeStringList(capability.platforms, { label: "Capability platforms", maxLength: ALL_PLATFORMS.length, pattern: /^(web|windows|macos|linux|android|ios)$/u }) : null;
  const supportedPlatforms = hasSupportedPlatforms
    ? normalizeStringList(capability.supportedPlatforms, { label: "Supported platforms", maxLength: ALL_PLATFORMS.length, pattern: /^(web|windows|macos|linux|android|ios)$/u })
    : legacyPlatforms || [...ALL_PLATFORMS];
  if (legacyPlatforms && hasSupportedPlatforms && JSON.stringify(legacyPlatforms) !== JSON.stringify(supportedPlatforms)) {
    throw new TypeError("Capability platforms and supportedPlatforms must match when both are declared.");
  }

  const version = Object.hasOwn(capability, "version") ? capability.version : "1.0.0";
  parseSemver(version, "Capability version");
  const dependencies = normalizeStringList(Object.hasOwn(capability, "dependencies") ? capability.dependencies : [], {
    label: "Capability dependencies",
    maxLength: MAX_DEPENDENCIES,
    pattern: CAPABILITY_ID,
  });
  if (dependencies.includes(id)) throw new TypeError("Capability cannot depend on itself.");

  const runtimeInput = Object.hasOwn(capability, "runtimeRequirements") ? capability.runtimeRequirements : {};
  if (!runtimeInput || typeof runtimeInput !== "object" || Array.isArray(runtimeInput) ||
      (Object.getPrototypeOf(runtimeInput) !== Object.prototype && Object.getPrototypeOf(runtimeInput) !== null)) {
    throw new TypeError("Runtime requirements must be a plain object.");
  }
  const runtimeRequirements = snapshotPlainData(runtimeInput, "Runtime requirements");
  if (Object.keys(runtimeRequirements).some((key) => !["minVersion", "features"].includes(key))) {
    throw new TypeError("Runtime requirements contain an unsupported field.");
  }
  if (Object.hasOwn(runtimeRequirements, "minVersion")) parseSemver(runtimeRequirements.minVersion, "Minimum runtime version");
  runtimeRequirements.features = normalizeStringList(Object.hasOwn(runtimeRequirements, "features") ? runtimeRequirements.features : [], {
    label: "Runtime features",
    maxLength: MAX_RUNTIME_FEATURES,
    pattern: /^[a-z][a-z0-9._:-]{0,127}$/u,
  });

  const platformSupport = Object.hasOwn(capability, "platformSupport") ? capability.platformSupport : {};
  if (!platformSupport || typeof platformSupport !== "object" || Array.isArray(platformSupport) ||
      (Object.getPrototypeOf(platformSupport) !== Object.prototype && Object.getPrototypeOf(platformSupport) !== null)) {
    throw new TypeError("Capability platformSupport must be a plain object.");
  }
  for (const [platform, status] of Object.entries(platformSupport)) {
    if (!ALL_PLATFORMS.includes(platform) || !VALID_STATUSES.has(status)) {
      throw new TypeError("Capability platformSupport contains an invalid platform or status.");
    }
  }

  return {
    status: "unavailable",
    riskLevel: "low",
    ...capability,
    id,
    name: capability.name.trim(),
    version,
    platforms: [...supportedPlatforms],
    supportedPlatforms: [...supportedPlatforms],
    dependencies,
    runtimeRequirements,
    platformSupport: { ...platformSupport },
  };
}

function assertAcyclicRegistration(id, dependencies) {
  const visit = (candidateId, path, depth) => {
    if (candidateId === id) throw new TypeError("Capability dependencies cannot contain cycles.");
    if (depth >= MAX_DEPENDENCY_DEPTH) throw new TypeError("Capability dependency chain exceeds the supported depth.");
    if (path.has(candidateId)) return;
    const existing = capabilities.get(candidateId);
    if (!existing) return;
    path.add(candidateId);
    existing.dependencies.forEach((dependency) => visit(dependency, path, depth + 1));
    path.delete(candidateId);
  };
  dependencies.forEach((dependency) => visit(dependency, new Set(), 0));
}

export function registerCapability(input) {
  const capability = normalizeCapability(input);
  if (capabilities.has(capability.id)) throw new Error(`Capability is already registered: ${capability.id}`);
  assertAcyclicRegistration(capability.id, capability.dependencies);
  capabilities.set(capability.id, capability);
  return structuredClone(capability);
}

export function getCapability(id) {
  const capability = capabilities.get(id);
  return capability ? structuredClone(capability) : null;
}

export function listCapabilities() {
  return Array.from(capabilities.values(), (capability) => structuredClone(capability));
}

function adapterValue(adapter, key) {
  let current = adapter;
  try {
    while (current && (typeof current === "object" || typeof current === "function")) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor) return Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
      current = Object.getPrototypeOf(current);
    }
  } catch { return undefined; }
  return undefined;
}

function listContains(list, value) {
  try {
    if (!Array.isArray(list) || Object.getPrototypeOf(list) !== Array.prototype) return false;
    const length = Object.getOwnPropertyDescriptor(list, "length")?.value;
    if (!Number.isInteger(length) || length < 0 || length > 512) return false;
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(list, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, "value")) return false;
      if (descriptor.value === value) return true;
    }
    return false;
  } catch { return false; }
}

function getAvailability(capability, platform, adapter, path) {
  if (path.has(capability.id)) {
    return { capability: capability.id, platform, status: CAPABILITY_STATUS.unsupported, available: false, error: `Capability dependency cycle includes ${capability.id}.` };
  }
  if (path.size >= MAX_DEPENDENCY_DEPTH) {
    return { capability: capability.id, platform, status: CAPABILITY_STATUS.unsupported, available: false, error: "Capability dependency chain exceeds the supported depth." };
  }
  if (!capability.supportedPlatforms.includes(platform)) {
    return { capability: capability.id, platform, status: CAPABILITY_STATUS.unsupported, available: false, error: `Capability ${capability.id} does not support ${platform}.` };
  }

  const hasDeclaredStatus = Object.hasOwn(capability.platformSupport, platform);
  const declaredStatus = hasDeclaredStatus ? capability.platformSupport[platform] : CAPABILITY_STATUS.unsupported;
  const adapterPlatform = adapterValue(adapter, "platform");
  const adapterCapabilities = adapterValue(adapter, "capabilities");
  const adapterSupportsCapability = adapterPlatform === platform && listContains(adapterCapabilities, capability.id);
  let status = adapterSupportsCapability && !hasDeclaredStatus ? CAPABILITY_STATUS.supported : declaredStatus;
  let error = null;

  if (status === CAPABILITY_STATUS.supported && capability.runtimeRequirements.minVersion) {
    const runtimeVersion = adapterValue(adapter, "runtimeVersion");
    try {
      if (typeof runtimeVersion !== "string" || compareSemver(runtimeVersion, capability.runtimeRequirements.minVersion) < 0) {
        status = CAPABILITY_STATUS.unsupported;
        error = `Capability ${capability.id} requires runtime ${capability.runtimeRequirements.minVersion} or later.`;
      }
    } catch {
      status = CAPABILITY_STATUS.unsupported;
      error = `Capability ${capability.id} requires runtime ${capability.runtimeRequirements.minVersion} or later.`;
    }
  }
  if (status === CAPABILITY_STATUS.supported && capability.runtimeRequirements.features.length) {
    const runtimeFeatures = adapterValue(adapter, "runtimeFeatures");
    const missing = capability.runtimeRequirements.features.filter((feature) => !listContains(runtimeFeatures, feature));
    if (missing.length) {
      status = CAPABILITY_STATUS.unsupported;
      error = `Capability ${capability.id} requires runtime feature(s): ${missing.join(", ")}.`;
    }
  }

  if ([CAPABILITY_STATUS.supported, CAPABILITY_STATUS.permissionRequired].includes(status) && capability.dependencies.length) {
    const nextPath = new Set(path);
    nextPath.add(capability.id);
    for (const dependencyId of capability.dependencies) {
      const dependency = capabilities.get(dependencyId);
      if (!dependency) {
        status = CAPABILITY_STATUS.unsupported;
        error = `Capability ${capability.id} requires missing dependency ${dependencyId}.`;
        break;
      }
      const dependencyAvailability = getAvailability(dependency, platform, adapter, nextPath);
      if (dependencyAvailability.status !== CAPABILITY_STATUS.supported) {
        status = dependencyAvailability.status;
        error = `Capability ${capability.id} dependency ${dependencyId} is unavailable: ${dependencyAvailability.error || dependencyAvailability.status}.`;
        break;
      }
    }
  }

  return {
    capability: capability.id,
    platform,
    status,
    available: status === CAPABILITY_STATUS.supported,
    requiresPermission: status === CAPABILITY_STATUS.permissionRequired,
    restricted: status === CAPABILITY_STATUS.restricted,
    ...(error ? { error } : {}),
  };
}

export function getCapabilityAvailability(id, platform = "web", adapter = null) {
  const capability = capabilities.get(id);
  if (!capability) {
    return { capability: id, platform, status: CAPABILITY_STATUS.unsupported, available: false, error: `Capability ${id} is not registered.` };
  }
  return getAvailability(capability, platform, adapter, new Set());
}

export function executeCapability(id, input = {}, adapter = null) {
  const capability = capabilities.get(id);
  if (!capability) return unsupportedCapability(id);
  const adapterPlatform = adapterValue(adapter, "platform");
  const execute = adapterValue(adapter, "execute");
  if (typeof execute !== "function") return unsupportedCapability(id, adapterPlatform);
  const availability = getCapabilityAvailability(id, adapterPlatform, adapter);
  const adapterCapabilities = adapterValue(adapter, "capabilities");
  if (availability.status === CAPABILITY_STATUS.restricted || availability.status === CAPABILITY_STATUS.permissionRequired) {
    return {
      success: false,
      capability: id,
      platform: adapterPlatform,
      status: availability.status,
      error: availability.error || (availability.status === CAPABILITY_STATUS.restricted
        ? `Capability ${id} is restricted on ${adapterPlatform}.`
        : `Capability ${id} requires platform permission before execution.`),
      verified: false,
    };
  }
  if (!availability.available || !capability.supportedPlatforms.includes(adapterPlatform) || !listContains(adapterCapabilities, id)) {
    if (!availability.error) return unsupportedCapability(id, adapterPlatform);
    return {
      ...unsupportedCapability(id, adapterPlatform),
      status: availability.status,
      ...(availability.error ? { error: availability.error } : {}),
    };
  }
  return Reflect.apply(execute, adapter, [{ capability: id, input }]);
}

[
  ["system.info", "Read system information", "low"],
  ["browser.open_url", "Open an approved URL", "medium"],
  ["screen.capture", "Capture the display", "high"],
  ["app.open", "Open application", "high"],
  ["app.close", "Close application", "high"],
  ["filesystem.read", "Read a file", "low"],
  ["filesystem.write", "Create or edit a file", "high"],
  ["filesystem.create_directory", "Create a directory", "high"],
  ["filesystem.list", "List files and folders", "low"],
  ["filesystem.delete", "Delete a file or folder", "critical"],
  ["filesystem.organize", "Organize files", "high"],
  ["terminal.execute", "Execute a terminal command", "critical"],
  ["window.control", "Manage application windows", "high"],
  ["input.control", "Control keyboard or pointer input", "critical"],
  ["browser.navigate", "Navigate an approved browser session", "medium"],
  ["browser.read", "Read an accessible web page", "low"],
  ["vision.inspect", "Inspect a captured screen or image", "high"],
  ["hardware.inspect", "Inspect available system hardware", "low"],
  ["notifications.create", "Create a notification", "medium"],
  ["media.control", "Control supported media", "medium"],
  ["generation.image", "Generate images from text prompts", "high"],
  ["generation.video", "Generate videos from text or images", "high"],
  ["generation.audio", "Generate speech/audio from text", "medium"],
  ["generation.music", "Generate music from text prompts", "high"],
].forEach(([id, name, riskLevel]) => registerCapability({ id, name, riskLevel }));

export default { registerCapability, getCapability, listCapabilities, getCapabilityAvailability, executeCapability, CAPABILITY_STATUS };
