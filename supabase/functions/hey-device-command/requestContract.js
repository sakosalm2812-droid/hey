const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION = /^[a-z][a-z0-9_.:-]{0,127}$/i;
const MAX_BYTES = 65_536;

function snapshotJson(value, ancestors = new WeakSet(), depth = 0, nodes = { count: 0 }) {
  nodes.count += 1;
  if (depth > 32 || nodes.count > 10_000) throw new TypeError("Request complexity exceeded.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || ancestors.has(value)) throw new TypeError("Request must contain plain JSON data.");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new TypeError("Request must contain plain JSON data.");
  ancestors.add(value);
  try {
    const keys = Reflect.ownKeys(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("Request cannot contain symbol properties.");
    if (array) {
      if (keys.length !== value.length + 1) throw new TypeError("Request arrays cannot contain holes or custom properties.");
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Request accessors are not allowed.");
        return snapshotJson(descriptor.value, ancestors, depth + 1, nodes);
      });
    }
    const output = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (["__proto__", "prototype", "constructor"].includes(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Request properties are invalid.");
      Object.defineProperty(output, key, { value: snapshotJson(descriptor.value, ancestors, depth + 1, nodes), enumerable: true, writable: true, configurable: true });
    }
    return output;
  } finally { ancestors.delete(value); }
}

function hasControls(value) { return [...value].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127); }

/** Take a detached snapshot before any auth, database, or mandate-store await. */
export function normalizeDeviceCommandRequest(value) {
  try {
    const body = snapshotJson(value);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    if (Object.keys(body).sort().join(",") !== "deviceId,envelope,idempotencyKey,mandate") return null;
    const { deviceId, envelope, idempotencyKey, mandate } = body;
    if (typeof deviceId !== "string" || !UUID.test(deviceId)
      || typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 256 || hasControls(idempotencyKey)
      || !envelope || typeof envelope !== "object" || Array.isArray(envelope)
      || Object.keys(envelope).sort().join(",") !== "action,input,resource,version"
      || envelope.version !== 1 || typeof envelope.action !== "string" || !ACTION.test(envelope.action)
      || typeof envelope.resource !== "string" || !envelope.resource.trim() || envelope.resource.length > 256 || hasControls(envelope.resource)
      || !envelope.input || typeof envelope.input !== "object" || Array.isArray(envelope.input)
      || !mandate || typeof mandate !== "object" || Array.isArray(mandate)
      || Object.keys(mandate).sort().join(",") !== "payload,signature") return null;
    const normalized = {
      deviceId,
      idempotencyKey: idempotencyKey.trim(),
      envelope: { version: 1, action: envelope.action, resource: envelope.resource.trim(), input: envelope.input },
      mandate,
    };
    if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > MAX_BYTES) return null;
    return Object.freeze(normalized);
  } catch { return null; }
}
