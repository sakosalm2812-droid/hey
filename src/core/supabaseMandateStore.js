import { MANDATE_STORE_CONTRACT_VERSION } from "./actionMandate.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value, name) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(`${name} must be a UUID.`);
  return value;
}

function requiredIdempotencyKey(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || [...value].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127)) {
    throw new TypeError("A bounded printable mandate idempotency key is required.");
  }
  return value.trim();
}

function resultOrThrow({ data, error }, operation) {
  if (error) throw new Error(`Supabase mandate ${operation} failed: ${String(error.message || "unknown storage error")}`);
  return data;
}

/**
 * Durable authority adapter for trusted server-side callers. The atomic consume
 * RPC is service_role-only; never construct this with a browser/anon client.
 * Its SQL objects are installed by migration 20261014000000_action_mandates.sql.
 */
export class SupabaseMandateStore {
  constructor(client, { trustedServer = false } = {}) {
    if (!client || typeof client.rpc !== "function") throw new TypeError("A configured Supabase client is required for durable mandate storage.");
    if (trustedServer !== true) throw new TypeError("SupabaseMandateStore is restricted to trusted server-side clients.");
    this.client = client;
    Object.defineProperty(this, "contractVersion", { value: MANDATE_STORE_CONTRACT_VERSION, enumerable: true });
    Object.defineProperty(this, "testOnly", { value: false, enumerable: true });
  }

  async getCurrentRevocationEpoch(accountId) {
    const data = resultOrThrow(await this.client.rpc("get_hey_action_mandate_epoch", {
      p_account_id: requiredUuid(accountId, "accountId"),
    }), "epoch read");
    if (!Number.isSafeInteger(data) || data < 0) throw new Error("Supabase mandate epoch response was malformed.");
    return data;
  }

  async isRevoked(mandateId, { accountId } = {}) {
    const data = resultOrThrow(await this.client.rpc("is_hey_action_mandate_revoked", {
      p_account_id: requiredUuid(accountId, "accountId"),
      p_mandate_id: requiredUuid(mandateId, "mandateId"),
    }), "revocation read");
    if (typeof data !== "boolean") throw new Error("Supabase mandate revocation response was malformed.");
    return data;
  }

  async revoke(mandateId, { accountId, reason = "user_request" } = {}) {
    if (typeof reason !== "string" || !reason.trim() || reason.length > 500) throw new TypeError("A bounded mandate revocation reason is required.");
    const data = resultOrThrow(await this.client.rpc("revoke_hey_action_mandate", {
      p_account_id: requiredUuid(accountId, "accountId"),
      p_mandate_id: requiredUuid(mandateId, "mandateId"),
      p_reason: reason.trim(),
    }), "revocation");
    if (data !== true) throw new Error("Supabase did not confirm mandate revocation.");
    return true;
  }

  async advanceRevocationEpoch(accountId) {
    const data = resultOrThrow(await this.client.rpc("advance_hey_action_mandate_epoch", {
      p_account_id: requiredUuid(accountId, "accountId"),
    }), "epoch advance");
    if (!Number.isSafeInteger(data) || data < 1) throw new Error("Supabase mandate epoch response was malformed.");
    return data;
  }

  async consumeChain(mandates, idempotencyKey, { accountId, revocationEpoch } = {}) {
    if (!Array.isArray(mandates) || mandates.length < 1 || mandates.length > 5
      || !Number.isSafeInteger(revocationEpoch) || revocationEpoch < 0) return { consumed: false, reason: "invalid_context" };
    let normalized;
    let key;
    let account;
    try {
      account = requiredUuid(accountId, "accountId");
      key = requiredIdempotencyKey(idempotencyKey);
      normalized = mandates.map(({ mandateId, maxUses, revocationEpoch: itemEpoch }) => {
        const id = requiredUuid(mandateId, "mandateId");
        if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 10_000
          || !Number.isSafeInteger(itemEpoch) || itemEpoch !== revocationEpoch) throw new TypeError("Mandate chain limits and epochs must be valid and consistent.");
        return { mandate_id: id, max_uses: maxUses, revocation_epoch: itemEpoch };
      });
      if (new Set(normalized.map(({ mandate_id }) => mandate_id)).size !== normalized.length) return { consumed: false, reason: "invalid_context" };
    } catch {
      return { consumed: false, reason: "invalid_context" };
    }

    const data = resultOrThrow(await this.client.rpc("consume_hey_action_mandate_chain", {
      p_account_id: account,
      p_revocation_epoch: revocationEpoch,
      p_mandates: normalized,
      p_idempotency_key: key,
    }), "atomic consumption");
    if (!data || typeof data !== "object" || typeof data.consumed !== "boolean") throw new Error("Supabase mandate consumption response was malformed.");
    if (data.consumed) {
      if (!Number.isSafeInteger(data.remainingUses) || data.remainingUses < 0) throw new Error("Supabase mandate consumption response was malformed.");
      return { consumed: true, remainingUses: data.remainingUses };
    }
    if (!["invalid_context", "stale_epoch", "revoked", "replay", "max_uses"].includes(data.reason)) throw new Error("Supabase mandate denial response was malformed.");
    return { consumed: false, reason: data.reason };
  }
}

export default SupabaseMandateStore;
