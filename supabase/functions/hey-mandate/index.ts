import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAndConsumeMandate } from "../../../src/core/actionMandate.js";
import { SupabaseMandateStore } from "../../../src/core/supabaseMandateStore.js";
import { readBoundedJson } from "../hey/requestSafety.js";
import { normalizeMandateVerificationRequest } from "./requestContract.js";

const allowedOrigin = Deno.env.get("APP_URL") || "http://localhost:5173";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function trustedMandateKeys() {
  const raw = Deno.env.get("HEY_ACTION_MANDATE_TRUSTED_KEYS");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed);
    if (!entries.length || entries.length > 100 || entries.some(([key, value]) =>
      !key || key.length > 256 || typeof value !== "string" || !value,
    )) return null;
    return new Map(entries);
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { authorized: false, reason: "POST is required." });
  if (request.headers.get("origin") && request.headers.get("origin") !== allowedOrigin) {
    return json(403, { authorized: false, reason: "Origin is not allowed." });
  }

  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const keys = trustedMandateKeys();
  if (!authorization || !url || !anonKey || !serviceKey || !keys) {
    return json(503, { authorized: false, reason: "Mandate verification service is not configured." });
  }

  const parsed = await readBoundedJson(request, 64 * 1024);
  if (!parsed.ok) return json(parsed.tooLarge ? 413 : 400, { authorized: false, reason: "Mandate request is invalid or too large." });

  try {
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user?.id) return json(401, { authorized: false, reason: "An authenticated account is required." });

    const rateLimit = await userClient.rpc("consume_hey_rate_limit");
    if (rateLimit.error) return json(503, { authorized: false, reason: "Mandate rate-limit authority is unavailable." });
    if (rateLimit.data !== true) return json(429, { authorized: false, reason: "Mandate verification rate limit reached." });

    const normalized = normalizeMandateVerificationRequest(parsed.value, userData.user.id);
    if (!normalized) return json(400, { authorized: false, reason: "Mandate request context is invalid." });

    const serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const store = new SupabaseMandateStore(serviceClient, { trustedServer: true });
    const currentRevocationEpoch = await store.getCurrentRevocationEpoch(userData.user.id);
    const result = await verifyAndConsumeMandate(normalized.mandate, {
      ...normalized.context,
      currentRevocationEpoch,
    }, { trustedKeys: keys, store, online: true });

    return json(200, result);
  } catch {
    // Keep key, account, and database diagnostics out of caller-visible errors.
    return json(503, { authorized: false, reason: "Mandate verification authority is unavailable." });
  }
});
