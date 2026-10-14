import { EVIDENCE_STORE_CONTRACT_VERSION } from "./evidenceIntegrity.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value, name) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(`${name} must be a UUID.`);
  return value;
}

function safeInvalidationReason(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(value)) throw new TypeError("Evidence invalidation reason must be a bounded machine-safe code.");
  return value;
}

function resultOrThrow({ data, error }, operation) {
  if (error) throw new Error(`Supabase evidence ${operation} failed: ${String(error.message || "unknown storage error")}`);
  return data;
}

/** Durable account-scoped invalidation adapter for trusted server-side callers. */
export class SupabaseEvidenceStore {
  constructor(client, { trustedServer = false } = {}) {
    if (!client || typeof client.rpc !== "function") throw new TypeError("A configured Supabase client is required for durable evidence storage.");
    if (trustedServer !== true) throw new TypeError("SupabaseEvidenceStore is restricted to trusted server-side clients.");
    this.client = client;
    Object.defineProperty(this, "contractVersion", { value: EVIDENCE_STORE_CONTRACT_VERSION, enumerable: true });
    Object.defineProperty(this, "testOnly", { value: false, enumerable: true });
  }

  async isInvalidated(evidenceId, { accountId } = {}) {
    const data = resultOrThrow(await this.client.rpc("is_hey_evidence_invalidated", {
      p_account_id: requiredUuid(accountId, "accountId"),
      p_evidence_id: requiredUuid(evidenceId, "evidenceId"),
    }), "invalidation lookup");
    if (typeof data !== "boolean") throw new Error("Supabase evidence invalidation response was malformed.");
    return data;
  }

  async invalidate(evidenceId, reason, { accountId } = {}) {
    const data = resultOrThrow(await this.client.rpc("invalidate_hey_evidence", {
      p_account_id: requiredUuid(accountId, "accountId"),
      p_evidence_id: requiredUuid(evidenceId, "evidenceId"),
      p_reason: safeInvalidationReason(reason),
    }), "invalidation");
    if (data !== true) throw new Error("Supabase did not confirm evidence invalidation.");
    return { evidenceId, accountId, reason, invalidated: true };
  }
}

export default SupabaseEvidenceStore;
