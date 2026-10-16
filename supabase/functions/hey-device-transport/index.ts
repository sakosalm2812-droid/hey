import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SupabaseDeviceCommandQueueStore } from "../../../src/core/supabaseDeviceCommandQueueStore.js";
import { readBoundedJson } from "../hey/requestSafety.js";
import { createDeviceTransportRequestScope, handleDeviceTransport, issueDeviceCredential, normalizeAccountDeviceRequest, revokeOwnedDeviceTransport } from "./dispatch.js";

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

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { ok: false, reason: "POST is required." });
  if (request.headers.get("origin") && request.headers.get("origin") !== allowedOrigin) return json(403, { ok: false, reason: "Origin is not allowed." });
  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization || !url || !anonKey || !serviceKey) return json(503, { ok: false, reason: "Device transport is not configured." });
  const parsed = await readBoundedJson(request, 8 * 1024);
  if (!parsed.ok) return json(parsed.tooLarge ? 413 : 400, { ok: false, reason: "Device transport request is invalid or too large." });

  const scope = createDeviceTransportRequestScope({ signal: request.signal });
  try {
    const scopedFetch: typeof fetch = (input, init = {}) => fetch(input, { ...init, signal: scope.signal });
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization }, fetch: scopedFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await scope.race(userClient.auth.getUser());
    const accountId = userData?.user?.id;
    const serviceClient = createClient(url, serviceKey, {
      global: { fetch: scopedFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const accountRequest = normalizeAccountDeviceRequest(parsed.value);
    if (accountRequest?.operation === "revoke") {
      if (authError || !accountId) return json(401, { ok: false, reason: "An authenticated account is required." });
      const result = await scope.race(revokeOwnedDeviceTransport({
        authenticatedAccountId: accountId,
        deviceId: accountRequest.deviceId,
        revokeDevice: async (userId: string, deviceId: string) => {
          const { data, error } = await serviceClient.rpc("revoke_hey_device_transport", { p_account_id: userId, p_device_id: deviceId });
          if (error) throw new Error("Device revocation failed.");
          return data === true;
        },
      }));
      return json(result.status, result);
    }

    const queue = new SupabaseDeviceCommandQueueStore(serviceClient, { trustedServer: true });
    const deviceCredentials = {
      async rotate(userId: string, deviceId: string, secretHash: string) {
        const { data, error } = await serviceClient.rpc("rotate_hey_device_credential", { p_account_id: userId, p_device_id: deviceId, p_secret_hash: secretHash });
        if (error) throw new Error("Credential rotation failed.");
        return data === true;
      },
      async authenticate(secretHash: string) {
        const { data, error } = await serviceClient.rpc("authenticate_hey_device_credential", { p_secret_hash: secretHash });
        if (error) throw new Error("Credential lookup failed.");
        if (!data || typeof data !== "object") return null;
        return { accountId: data.accountId, deviceId: data.deviceId, active: data.active === true };
      },
    };

    if (accountRequest?.operation === "rotate") {
      if (authError || !accountId) return json(401, { ok: false, reason: "An authenticated account is required." });
      const { data: device, error } = await scope.race(serviceClient.from("hey_devices").select("id,user_id,status").eq("id", accountRequest.deviceId).maybeSingle());
      if (error) return json(503, { ok: false, reason: "Device ownership lookup is unavailable." });
      const result = await scope.race(issueDeviceCredential({ authenticatedAccountId: accountId, deviceId: accountRequest.deviceId, loadDevice: async () => device, credentialStore: deviceCredentials }));
      return json(result.ok ? 200 : result.reason.includes("unavailable for this account") ? 403 : 503, result);
    }

    const result = await scope.race(handleDeviceTransport({ authorization, body: parsed.value, credentialStore: deviceCredentials, queue }));
    return json(result.status, result);
  } catch {
    return json(scope.callerAborted() ? 499 : 503, { ok: false, reason: scope.timedOut() ? "Device transport timed out." : "Device transport is unavailable." });
  } finally {
    scope.dispose();
  }
});
