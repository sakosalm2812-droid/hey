const PROVIDER_IDS = new Set(["openai", "openrouter", "gemini", "groq"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TOKENS_PER_DIRECTION = 1_000_000;
const RECEIPT_KEYS = [
  "schemaVersion", "status", "receiptId", "providerId", "configuredModelId", "providerReportedModelId",
  "providerResponseId", "requestTiming", "usageStatus", "usage",
];

function ownDataValue(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(value);
    return keys.length === expected.length && keys.every((key) => typeof key === "string" && expected.includes(key)) &&
      keys.every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor?.enumerable && Object.hasOwn(descriptor, "value");
      });
  } catch {
    return false;
  }
}

function safeIdentifier(value) {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : null;
}

function getProviderUsage(providerId, data) {
  const usage = ownDataValue(data, providerId === "gemini" ? "usageMetadata" : "usage");
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return { status: "unavailable", usage: null };
  const inputTokens = ownDataValue(usage, providerId === "gemini" ? "promptTokenCount" : "prompt_tokens");
  const outputTokens = ownDataValue(usage, providerId === "gemini" ? "candidatesTokenCount" : "completion_tokens");
  if (inputTokens === undefined && outputTokens === undefined) return { status: "unavailable", usage: null };
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > MAX_TOKENS_PER_DIRECTION ||
    !Number.isSafeInteger(outputTokens) || outputTokens < 0 || outputTokens > MAX_TOKENS_PER_DIRECTION) {
    return { status: "invalid", usage: null };
  }
  return {
    status: "reported",
    usage: Object.freeze({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      source: "provider_reported",
    }),
  };
}

/** Create content-free telemetry for one completed provider response. */
export function createProviderExecutionReceipt(input = {}) {
  if (!hasExactKeys(input, ["providerId", "configuredModelId", "data", "elapsedMs", "receiptId"])) return null;
  const providerId = ownDataValue(input, "providerId");
  const configuredModelId = ownDataValue(input, "configuredModelId");
  const data = ownDataValue(input, "data");
  const elapsedMs = ownDataValue(input, "elapsedMs");
  const receiptId = ownDataValue(input, "receiptId");
  if (!PROVIDER_IDS.has(providerId) || !safeIdentifier(configuredModelId) || !RECEIPT_ID.test(receiptId || "") ||
    !Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > 35_000 ||
    !data || typeof data !== "object" || Array.isArray(data)) return null;

  const modelField = providerId === "gemini" ? "modelVersion" : "model";
  const usage = getProviderUsage(providerId, data);
  return Object.freeze({
    schemaVersion: 1,
    status: "provider_response_received",
    receiptId,
    providerId,
    configuredModelId,
    providerReportedModelId: safeIdentifier(ownDataValue(data, modelField)),
    providerResponseId: safeIdentifier(ownDataValue(data, "id")),
    requestTiming: Object.freeze({
      elapsedMs,
      scope: "provider_http_round_trip",
      source: "edge_wall_clock",
    }),
    usageStatus: usage.status,
    usage: usage.usage,
  });
}

/** Validate an untrusted receipt from the chat response before displaying it. */
export function parseProviderExecutionReceipt(value) {
  if (!hasExactKeys(value, RECEIPT_KEYS) || value.schemaVersion !== 1 || value.status !== "provider_response_received" ||
    typeof value.receiptId !== "string" || !RECEIPT_ID.test(value.receiptId) || !PROVIDER_IDS.has(value.providerId) ||
    !safeIdentifier(value.configuredModelId) ||
    !(value.providerReportedModelId === null || safeIdentifier(value.providerReportedModelId)) ||
    !(value.providerResponseId === null || safeIdentifier(value.providerResponseId)) ||
    !hasExactKeys(value.requestTiming, ["elapsedMs", "scope", "source"]) ||
    !Number.isSafeInteger(value.requestTiming.elapsedMs) || value.requestTiming.elapsedMs < 0 || value.requestTiming.elapsedMs > 35_000 ||
    value.requestTiming.scope !== "provider_http_round_trip" || value.requestTiming.source !== "edge_wall_clock" ||
    !["reported", "unavailable", "invalid"].includes(value.usageStatus)) return null;

  let usage = null;
  if (value.usageStatus === "reported") {
    if (!hasExactKeys(value.usage, ["inputTokens", "outputTokens", "totalTokens", "source"]) ||
      !Number.isSafeInteger(value.usage.inputTokens) || value.usage.inputTokens < 0 || value.usage.inputTokens > MAX_TOKENS_PER_DIRECTION ||
      !Number.isSafeInteger(value.usage.outputTokens) || value.usage.outputTokens < 0 || value.usage.outputTokens > MAX_TOKENS_PER_DIRECTION ||
      value.usage.totalTokens !== value.usage.inputTokens + value.usage.outputTokens || value.usage.source !== "provider_reported") return null;
    usage = Object.freeze({ ...value.usage });
  } else if (value.usage !== null) {
    return null;
  }

  return Object.freeze({
    schemaVersion: 1,
    status: "provider_response_received",
    receiptId: value.receiptId,
    providerId: value.providerId,
    configuredModelId: value.configuredModelId,
    providerReportedModelId: value.providerReportedModelId,
    providerResponseId: value.providerResponseId,
    requestTiming: Object.freeze({ ...value.requestTiming }),
    usageStatus: value.usageStatus,
    usage,
  });
}
