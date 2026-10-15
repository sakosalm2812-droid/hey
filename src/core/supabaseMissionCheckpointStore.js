const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CHECKPOINT_BYTES = 1_048_576;

function requiredUuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(`${label} must be a UUID.`);
  return value;
}

function requiredMissionId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new TypeError("Mission id must be bounded identifier text.");
  return value;
}

function cloneJson(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || ancestors.has(value)) throw new TypeError("Mission checkpoint must be plain JSON data.");
  ancestors.add(value);
  try {
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new TypeError("Mission checkpoint must be plain JSON data.");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) throw new TypeError("Mission checkpoint cannot contain symbol properties.");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (array) {
      if (keys.length !== value.length + 1) throw new TypeError("Mission checkpoint arrays cannot contain holes or custom properties.");
      const result = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) throw new TypeError("Mission checkpoint cannot contain accessors.");
        result.push(cloneJson(descriptor.value, ancestors));
      }
      return result;
    }
    const result = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) throw new TypeError("Mission checkpoint cannot contain accessors.");
      Object.defineProperty(result, key, { value: cloneJson(descriptor.value, ancestors), enumerable: true, configurable: true, writable: true });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function rpcData(result, operation) {
  if (!result || typeof result !== "object" || result.error) throw new Error(`Supabase mission checkpoint ${operation} failed.`);
  return result.data;
}

function checkpointRecord(value) {
  if (!value || typeof value !== "object" || !Number.isSafeInteger(value.revision) || value.revision < 1 || !value.checkpoint || typeof value.checkpoint !== "object" || Array.isArray(value.checkpoint)) {
    throw new Error("Supabase mission checkpoint response was malformed.");
  }
  return { revision: value.revision, checkpoint: cloneJson(value.checkpoint) };
}

/** Account-bound revisioned checkpoint persistence through authenticated RPCs. */
export class SupabaseMissionCheckpointStore {
  constructor(client) {
    if (!client || typeof client.rpc !== "function") throw new TypeError("A configured Supabase client is required for mission checkpoint storage.");
    this.client = client;
    Object.defineProperty(this, "testOnly", { value: false, enumerable: true });
  }

  async load(accountId, missionId) {
    const data = rpcData(await this.client.rpc("load_hey_mission_checkpoint", {
      p_account_id: requiredUuid(accountId, "accountId"),
      p_mission_id: requiredMissionId(missionId),
    }), "load");
    return data === null ? null : checkpointRecord(data);
  }

  async save(accountId, missionId, checkpoint, { expectedRevision = null } = {}) {
    const safeCheckpoint = cloneJson(checkpoint);
    if (!safeCheckpoint || typeof safeCheckpoint !== "object" || Array.isArray(safeCheckpoint)) throw new TypeError("Mission checkpoint must be a JSON object.");
    if (new TextEncoder().encode(JSON.stringify(safeCheckpoint)).byteLength > MAX_CHECKPOINT_BYTES) throw new RangeError("Mission checkpoint exceeds 1 MiB.");
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) throw new TypeError("Expected mission checkpoint revision must be a positive safe integer or null.");
    const data = rpcData(await this.client.rpc("save_hey_mission_checkpoint", {
      p_account_id: requiredUuid(accountId, "accountId"),
      p_mission_id: requiredMissionId(missionId),
      p_checkpoint: safeCheckpoint,
      p_expected_revision: expectedRevision,
    }), "save");
    if (!data || typeof data !== "object" || typeof data.saved !== "boolean" || (data.saved && (!Number.isSafeInteger(data.revision) || data.revision < 1))) {
      throw new Error("Supabase mission checkpoint response was malformed.");
    }
    return data.saved ? { saved: true, revision: data.revision } : { saved: false, conflict: true };
  }
}

export default SupabaseMissionCheckpointStore;
