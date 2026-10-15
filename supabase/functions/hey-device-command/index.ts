import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SupabaseDeviceCommandQueueStore } from "../../../src/core/supabaseDeviceCommandQueueStore.js";
import { SupabaseMandateStore } from "../../../src/core/supabaseMandateStore.js";
import { readBoundedJson } from "../hey/requestSafety.js";
import { enqueueAuthorizedDeviceCommand } from "./dispatch.js";
import { normalizeDeviceCommandRequest } from "./requestContract.js";

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
    if (!entries.length || entries.length > 100 || entries.some(([key, value]) => !key || key.length > 256 || typeof value !== "string" || !value)) return null;
    return new Map(entries);
  } catch { return null; }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { enqueued: false, reason: "POST is required." });
  if (request.headers.get("origin") && request.headers.get("origin") !== allowedOrigin) return json(403, { enqueued: false, reason: "Origin is not allowed." });

  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const keys = trustedMandateKeys();
  if (!authorization || !url || !anonKey || !serviceKey || !keys) return json(503, { enqueued: false, reason: "Device command service is not configured." });

  const parsed = await readBoundedJson(request, 64 * 1024);
  if (!parsed.ok) return json(parsed.tooLarge ? 413 : 400, { enqueued: false, reason: "Device command request is invalid or too large." });
  const snapshot = normalizeDeviceCommandRequest(parsed.value);
  if (!snapshot) return json(400, { enqueued: false, reason: "Device command request is invalid." });

  try {
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    const accountId = userData?.user?.id;
    if (authError || !accountId) return json(401, { enqueued: false, reason: "An authenticated account is required." });

    const rateLimit = await userClient.rpc("consume_hey_rate_limit");
    if (rateLimit.error) return json(503, { enqueued: false, reason: "Request protection is unavailable." });
    if (rateLimit.data !== true) return json(429, { enqueued: false, reason: "Request limit reached." });

    const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const mandateStore = new SupabaseMandateStore(serviceClient, { trustedServer: true });
    const queue = new SupabaseDeviceCommandQueueStore(serviceClient, { trustedServer: true });
    const loadAccount = async (userId: string, action: string) => {
      const [{ data: profile, error: profileError }, { data: permissions, error: permissionError }] = await Promise.all([
        serviceClient.from("profiles").select("id,plan,entitlements").eq("id", userId).maybeSingle(),
        serviceClient.from("hey_permissions").select("permission,scope,status").eq("user_id", userId).eq("permission", action),
      ]);
      if (profileError || permissionError || !profile || profile.id !== userId || !Array.isArray(permissions)) throw new Error("Account authorization lookup failed.");
      return { userId, profile, permissions };
    };
    const loadDevice = async (userId: string, deviceId: string) => {
      const { data, error } = await serviceClient.from("hey_devices").select("id,user_id,status,capabilities").eq("id", deviceId).maybeSingle();
      if (error) throw new Error("Device ownership lookup failed.");
      return data?.user_id === userId ? data : null;
    };

    const result = await enqueueAuthorizedDeviceCommand({
      authenticatedAccountId: accountId,
      body: snapshot,
      loadAccount,
      loadDevice,
      mandateStore,
      trustedKeys: keys,
      queue,
    });
    return json(result.enqueued ? 200 : 403, result);
  } catch {
    // Keep database, key, token, command envelope, and service credentials private.
    return json(503, { enqueued: false, reason: "Device command authorization or queue service is unavailable." });
  }
});
