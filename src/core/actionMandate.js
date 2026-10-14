const FORMAT = "hey.action-mandate.v1";
const encoder = new TextEncoder();

function canonical(value, ancestors = new WeakSet()) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Signed payloads cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (!value || typeof value !== "object") throw new TypeError("Signed payloads must contain JSON-compatible values only.");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("Signed payloads cannot contain class instances.");
  if (ancestors.has(value)) throw new TypeError("Signed payloads cannot contain cyclic references.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      const ownKeys = Reflect.ownKeys(value);
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index)) || ownKeys.length !== value.length + 1 || !ownKeys.includes("length")) throw new TypeError("Signed payload arrays cannot contain holes or custom properties.");
      const descriptors = Object.getOwnPropertyDescriptors(value);
      return `[${keys.map((key) => {
        if (!Object.hasOwn(descriptors[key], "value")) throw new TypeError("Signed payloads cannot contain accessor properties.");
        return canonical(descriptors[key].value, ancestors);
      }).join(",")}]`;
    }
    const keys = Object.keys(value).sort();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of keys) {
      if (!Object.hasOwn(descriptors[key], "value")) throw new TypeError("Signed payloads cannot contain accessor properties.");
    }
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(descriptors[key].value, ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function isCanonicalStringList(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return false;
  const keys = Object.keys(value);
  const ownKeys = Reflect.ownKeys(value);
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index)) || ownKeys.length !== value.length + 1 || !ownKeys.includes("length")) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const items = keys.map((key) => {
    const descriptor = descriptors[key];
    return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
  });
  return items.every((item, index) => typeof item === "string" && item.length > 0 && item.trim() === item && !hasControlCharacters(item) && (index === 0 || items[index - 1] < item));
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function getDataRecord(record, expectedKeys) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some((key) => typeof key !== "string")) return null;
  const keys = ownKeys.sort();
  const wanted = [...expectedKeys].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) return null;
  const descriptors = Object.getOwnPropertyDescriptors(record);
  if (keys.some((key) => !Object.hasOwn(descriptors[key], "value") || !descriptors[key].enumerable)) return null;
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function isValidPayload(payload) {
  try {
    const expectedKeys = ["accountId", "actions", "delegable", "delegateKeyIds", "delegationDepth", "expiresAt", "format", "id", "issuedAt", "maxUses", "offlineAllowed", "parent", "resources", "revocationEpoch"];
    const record = getDataRecord(payload, expectedKeys);
    if (!record) return false;
    const value = (key) => record[key];
    const actions = value("actions");
    const resources = value("resources");
    const delegateKeyIds = value("delegateKeyIds");
    const issuedAtText = value("issuedAt");
    const expiresAtText = value("expiresAt");
    if (value("format") !== FORMAT
      || typeof value("id") !== "string" || !value("id") || value("id").length > 128
      || typeof value("accountId") !== "string" || !value("accountId") || value("accountId").length > 256 || value("accountId").trim() !== value("accountId") || hasControlCharacters(value("accountId"))
      || !isCanonicalStringList(actions)
      || !isCanonicalStringList(resources)
      || !isCanonicalStringList(delegateKeyIds, { allowEmpty: true })
      || !Number.isSafeInteger(value("maxUses")) || value("maxUses") < 1 || value("maxUses") > 10000
      || !Number.isSafeInteger(value("revocationEpoch")) || value("revocationEpoch") < 0
      || typeof value("offlineAllowed") !== "boolean"
      || typeof value("delegable") !== "boolean"
      || !Number.isSafeInteger(value("delegationDepth")) || value("delegationDepth") < 0 || value("delegationDepth") > 4
      || !isCanonicalTimestamp(issuedAtText)
      || !isCanonicalTimestamp(expiresAtText)) return false;
    const issuedAt = Date.parse(issuedAtText);
    const expiresAt = Date.parse(expiresAtText);
    if (expiresAt <= issuedAt || expiresAt - issuedAt > 30 * 24 * 60 * 60 * 1000) return false;
    if (value("delegationDepth") === 0) return value("parent") === null && (value("delegable") || delegateKeyIds.length === 0);
    return value("parent") !== null && !value("delegable") && delegateKeyIds.length === 0;
  } catch {
    return false;
  }
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  try {
    if (typeof atob === "function") return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    return new Uint8Array(Buffer.from(value, "base64"));
  } catch { return null; }
}

function normalizedScope(values, field) {
  if (!Array.isArray(values) || values.length === 0 || values.some((item) => typeof item !== "string" || !item.trim())) {
    throw new TypeError(`${field} must be a non-empty array of non-empty strings.`);
  }
  return [...new Set(values.map((item) => item.trim()))].sort();
}

function assertSubset(childValues, parentValues, field) {
  if (!childValues.every((value) => parentValues.includes(value))) throw new Error(`Delegated ${field} must be a subset of the parent mandate.`);
}

function hasControlCharacters(value) {
  return [...value].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127);
}

export class InMemoryMandateStore {
  constructor() {
    this.usage = new Map();
    this.revoked = new Set();
    this.idempotency = new Set();
    this.revocationEpochs = new Map();
    this.transaction = Promise.resolve();
  }

  async isRevoked(mandateId) { return this.revoked.has(mandateId); }
  async revoke(mandateId) { this.revoked.add(mandateId); }
  setCurrentRevocationEpoch(accountId, epoch) {
    if (typeof accountId !== "string" || !accountId.trim() || !Number.isSafeInteger(epoch) || epoch < 0) throw new TypeError("A valid account and non-negative revocation epoch are required.");
    this.revocationEpochs.set(accountId, epoch);
  }
  async consumeUse({ mandateId, maxUses, idempotencyKey, accountId, revocationEpoch }) {
    return this.consumeChain([{ mandateId, maxUses, revocationEpoch }], idempotencyKey, { accountId, revocationEpoch });
  }

  async consumeChain(mandates, idempotencyKey, { accountId, revocationEpoch } = {}) {
    // A durable production adapter must check the account epoch, all revocation
    // records, use counters, and replay keys in the same transaction.
    let release;
    const prior = this.transaction;
    this.transaction = new Promise((resolve) => { release = resolve; });
    await prior;
    try {
      if (!Array.isArray(mandates) || mandates.length === 0 || typeof accountId !== "string" || !accountId.trim() || !Number.isSafeInteger(revocationEpoch) || revocationEpoch < 0) {
        return { consumed: false, reason: "invalid_context" };
      }
      if ((this.revocationEpochs.get(accountId) ?? 0) !== revocationEpoch) return { consumed: false, reason: "stale_epoch" };
      if (mandates.some(({ mandateId }) => this.revoked.has(mandateId))) return { consumed: false, reason: "revoked" };
      const replayKeys = mandates.map(({ mandateId }) => `${mandateId}:${idempotencyKey}`);
      if (replayKeys.some((key) => this.idempotency.has(key))) return { consumed: false, reason: "replay" };
      const counters = mandates.map(({ mandateId, maxUses }) => ({ mandateId, maxUses, uses: this.usage.get(mandateId) || 0 }));
      if (counters.some(({ uses, maxUses }) => uses >= maxUses)) return { consumed: false, reason: "max_uses" };
      for (const { mandateId, uses } of counters) this.usage.set(mandateId, uses + 1);
      replayKeys.forEach((key) => this.idempotency.add(key));
      return { consumed: true, remainingUses: counters.at(-1).maxUses - counters.at(-1).uses - 1 };
    } finally {
      release();
    }
  }
}

export class MandateStoreContract {
  async isRevoked() { throw new Error("Implement isRevoked(mandateId) against durable authority storage."); }
  async revoke() { throw new Error("Implement revoke(mandateId) against durable authority storage."); }
  async consumeChain() { throw new Error("Implement atomic consumeChain(mandates, idempotencyKey, { accountId, revocationEpoch }) in one durable transaction. Recheck current account epoch, revocation, idempotency, and every delegation-chain use counter before committing any increment."); }
}

export async function issueActionMandate(input, { privateKey, keyId, parent = null, now = Date.now() } = {}) {
  if (!globalThis.crypto?.subtle || !privateKey || !keyId) throw new TypeError("WebCrypto signing key and keyId are required.");
  if (!Number.isFinite(now)) throw new TypeError("A finite issuance time is required.");
  if (typeof keyId !== "string" || keyId.trim() !== keyId || keyId.length > 256 || hasControlCharacters(keyId)) throw new TypeError("keyId must be a bounded, printable string.");
  if (!input || typeof input !== "object" || typeof input.accountId !== "string" || !input.accountId.trim()) throw new TypeError("An authenticated accountId is required.");
  const actions = normalizedScope(input.actions, "actions");
  const resources = normalizedScope(input.resources, "resources");
  const maxUses = input.maxUses === undefined ? 1 : input.maxUses;
  if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 10000) throw new RangeError("maxUses must be an integer between 1 and 10000.");
  const issuedAt = new Date(now).toISOString();
  if (input.revocationEpoch !== undefined && (!Number.isSafeInteger(input.revocationEpoch) || input.revocationEpoch < 0)) throw new RangeError("revocationEpoch must be a non-negative integer.");
  const expiresAt = new Date(input.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new RangeError("expiresAt must be a future timestamp.");
  if (expiresAt - now > 30 * 24 * 60 * 60 * 1000) throw new RangeError("Action mandates may not exceed 30 days.");
  if (parent) {
    if (parent.payload.delegable !== true || !parent.payload.delegateKeyIds?.includes(keyId)) throw new Error("Parent mandate does not authorize this signing key to receive delegation.");
    if (parent.payload.accountId !== input.accountId) throw new Error("Delegated mandate account must match its parent.");
    assertSubset(actions, parent.payload.actions, "actions");
    assertSubset(resources, parent.payload.resources, "resources");
    if (expiresAt > Date.parse(parent.payload.expiresAt)) throw new Error("Delegated mandate cannot outlive its parent.");
    if (maxUses > parent.payload.maxUses) throw new Error("Delegated mandate cannot exceed parent maxUses.");
    if ((parent.payload.delegationDepth || 0) >= 4) throw new Error("Maximum mandate delegation depth exceeded.");
  } else if (input.delegationDepth) throw new Error("Only a verified parent mandate may delegate authority.");

  const payload = {
    format: FORMAT,
    id: globalThis.crypto.randomUUID(),
    accountId: input.accountId.trim(),
    actions,
    resources,
    issuedAt,
    expiresAt: new Date(expiresAt).toISOString(),
    maxUses,
    revocationEpoch: Number.isSafeInteger(input.revocationEpoch) ? input.revocationEpoch : 0,
    offlineAllowed: input.offlineAllowed === true,
    delegationDepth: parent ? (parent.payload.delegationDepth || 0) + 1 : 0,
    delegable: parent ? false : input.delegable === true,
    delegateKeyIds: parent ? [] : normalizedOptionalScope(input.delegateKeyIds || []),
    parent: parent ? { payload: parent.payload, signature: parent.signature } : null,
  };
  if (!isValidPayload(payload)) throw new TypeError("The action mandate payload does not satisfy the versioned schema.");
  const signature = await globalThis.crypto.subtle.sign({ name: "Ed25519" }, privateKey, encoder.encode(canonical(payload)));
  return Object.freeze({ payload: Object.freeze(payload), signature: Object.freeze({ algorithm: "Ed25519", keyId, value: bytesToBase64(new Uint8Array(signature)) }) });
}

function normalizedOptionalScope(values) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim())) throw new TypeError("delegateKeyIds must contain non-empty key IDs.");
  return [...new Set(values.map((value) => value.trim()))].sort();
}

async function verifySignature(mandate, trustedKeys) {
  try {
    const envelope = getDataRecord(mandate, ["payload", "signature"]);
    const signature = getDataRecord(envelope?.signature, ["algorithm", "keyId", "value"]);
    if (!envelope || !isValidPayload(envelope.payload) || !signature || signature.algorithm !== "Ed25519" || typeof signature.keyId !== "string" || !signature.keyId.trim() || signature.keyId.length > 256) return false;
    const key = trustedKeys instanceof Map ? trustedKeys.get(signature.keyId) : trustedKeys?.[signature.keyId];
    const signatureBytes = base64ToBytes(signature.value);
    if (!key || !signatureBytes || signatureBytes.length !== 64) return false;
    const isCryptoKey = typeof CryptoKey !== "undefined" && key instanceof CryptoKey;
    const publicKey = isCryptoKey ? key : await globalThis.crypto.subtle.importKey("raw", base64ToBytes(key), { name: "Ed25519" }, false, ["verify"]);
    return await globalThis.crypto.subtle.verify({ name: "Ed25519" }, publicKey, signatureBytes, encoder.encode(canonical(envelope.payload)));
  } catch { return false; }
}

export async function verifyAndConsumeMandate(mandate, context, { trustedKeys = {}, store, now = Date.now(), online = true } = {}) {
  const deny = (reason) => ({ authorized: false, reason });
  if (!store || typeof store.consumeChain !== "function" || typeof store.isRevoked !== "function") return deny("A durable mandate store with atomic delegation-chain consumption is required.");
  if (!await verifySignature(mandate, trustedKeys)) return deny("Mandate signature is invalid or untrusted.");
  const payload = mandate.payload;
  const expiry = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiry) || now >= expiry) return deny("Mandate has expired.");
  const issuedAt = Date.parse(payload.issuedAt);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || expiry - issuedAt > 30 * 24 * 60 * 60 * 1000) return deny("Mandate validity window is invalid.");
  if (!context || context.accountId !== payload.accountId) return deny("Mandate account does not match authenticated context.");
  if (!payload.actions.includes(context.action) || !payload.resources.includes(context.resource)) return deny("Mandate does not authorize this action and resource.");
  if (!Number.isSafeInteger(context.currentRevocationEpoch) || context.currentRevocationEpoch < 0 || context.currentRevocationEpoch !== payload.revocationEpoch) return deny("Mandate revocation epoch is stale or unavailable.");
  if (!online && payload.offlineAllowed !== true) return deny("Mandate is not valid for offline execution.");
  try {
    if (await store.isRevoked(payload.id)) return deny("Mandate has been revoked.");
  } catch {
    return deny("Mandate authority storage failed; execution was denied.");
  }
  const chain = [mandate];
  while (chain.at(-1).payload.parent) chain.push(chain.at(-1).payload.parent);
  for (let index = 0; index < chain.length; index += 1) {
    const current = chain[index];
    const currentPayload = current.payload;
    if (!await verifySignature(current, trustedKeys)) return deny("Delegation chain contains an invalid signature.");
    if (currentPayload.accountId !== payload.accountId || currentPayload.revocationEpoch !== context.currentRevocationEpoch || Date.parse(currentPayload.expiresAt) <= now) return deny("Delegation chain contains expired or stale authority.");
    try {
      if (await store.isRevoked(currentPayload.id)) return deny("Mandate or parent mandate has been revoked.");
    } catch {
      return deny("Mandate authority storage failed; execution was denied.");
    }
    if (index < chain.length - 1) {
      const child = chain[index];
      const parent = chain[index + 1];
      if (!parent.payload.delegable || !parent.payload.delegateKeyIds?.includes(child.signature.keyId) || child.payload.delegationDepth !== parent.payload.delegationDepth + 1) return deny("Delegation chain is invalid.");
      if (!child.payload.actions.every((action) => parent.payload.actions.includes(action)) || !child.payload.resources.every((resource) => parent.payload.resources.includes(resource)) || Date.parse(child.payload.expiresAt) > Date.parse(parent.payload.expiresAt) || child.payload.maxUses > parent.payload.maxUses) return deny("Delegated mandate exceeds parent authority.");
    }
  }
  const idempotencyKey = context.idempotencyKey;
  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 256 || [...idempotencyKey].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127)) return deny("A stable idempotency key up to 256 printable characters is required.");
  let result;
  try {
    result = await store.consumeChain(
      chain.map(({ payload: item }) => ({ mandateId: item.id, maxUses: item.maxUses, revocationEpoch: item.revocationEpoch })),
      idempotencyKey.trim(),
      { accountId: context.accountId, revocationEpoch: context.currentRevocationEpoch },
    );
  } catch {
    return deny("Mandate authority storage failed; execution was denied.");
  }
  if (result.consumed) return { authorized: true, mandateId: payload.id, remainingUses: result.remainingUses };
  if (result.reason === "replay") return deny("Mandate request replay detected.");
  if (result.reason === "revoked") return deny("Mandate was revoked before atomic use consumption.");
  if (result.reason === "stale_epoch") return deny("Mandate revocation epoch changed before atomic use consumption.");
  if (result.reason === "invalid_context") return deny("Atomic mandate storage rejected the authority context.");
  return deny("Mandate use limit reached.");
}

export { FORMAT as ACTION_MANDATE_FORMAT };
