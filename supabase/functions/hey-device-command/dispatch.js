import { authorizeExecution } from "../../../src/core/permissionManager.js";
import { verifyAndConsumeMandate } from "../../../src/core/actionMandate.js";
import { normalizeDeviceCommandRequest } from "./requestContract.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deny(reason) { return { enqueued: false, reason }; }

function accountPermissions(account, action) {
  if (!account || !account.profile || !Array.isArray(account.permissions)) return null;
  const granted = account.permissions.some((permission) => permission?.permission === action
    && permission.scope === "account" && permission.status === "granted");
  if (!granted) return null;
  return {
    id: account.userId,
    plan: account.profile.plan,
    entitlements: account.profile.entitlements,
    permissions: [action],
  };
}

function usableDevice(device, accountId, deviceId, action) {
  return device?.id === deviceId && device.user_id === accountId && device.status !== "revoked"
    && Array.isArray(device.capabilities) && device.capabilities.includes(action);
}

/**
 * Server-only authorization and queue boundary. Dependencies must be built from
 * the authenticated request and trusted service-role client in the Edge Function.
 */
export async function enqueueAuthorizedDeviceCommand({ authenticatedAccountId, body, loadAccount, loadDevice, mandateStore, trustedKeys, queue, now = Date.now() } = {}) {
  const request = normalizeDeviceCommandRequest(body);
  if (!request) return deny("Device command request is invalid.");
  if (typeof authenticatedAccountId !== "string" || !UUID.test(authenticatedAccountId)) return deny("An authenticated account is required.");
  if (typeof loadAccount !== "function" || typeof loadDevice !== "function" || !mandateStore || !trustedKeys || typeof queue?.enqueue !== "function") {
    return deny("Authorized device command service is unavailable.");
  }

  try {
    const account = await loadAccount(authenticatedAccountId, request.envelope.action);
    if (!account || account.userId !== authenticatedAccountId) return deny("Account authorization could not be verified.");
    const user = accountPermissions(account, request.envelope.action);
    if (!user) return deny("This account is not authorized for the requested device action.");

    let device = await loadDevice(authenticatedAccountId, request.deviceId);
    if (!usableDevice(device, authenticatedAccountId, request.deviceId, request.envelope.action)) {
      return deny("The requested device is unavailable for this account or action.");
    }

    // The candidate signed mandate is the explicit confirmation signal. It is
    // still cryptographically checked and atomically consumed below before enqueue.
    const identity = authorizeExecution({ user, capability: request.envelope.action, permission: request.envelope.action, riskLevel: "high", confirmed: true });
    if (!identity.authorized) return deny("Canonical account permission denied the device action.");

    const currentRevocationEpoch = await mandateStore.getCurrentRevocationEpoch(authenticatedAccountId);
    const mandate = await verifyAndConsumeMandate(request.mandate, {
      accountId: authenticatedAccountId,
      action: request.envelope.action,
      resource: request.envelope.resource,
      idempotencyKey: request.idempotencyKey,
      currentRevocationEpoch,
    }, { trustedKeys, store: mandateStore, now, online: true });
    if (!mandate.authorized) return deny("Action mandate is invalid, stale, revoked, or already used.");

    // Recheck permission, owner, and revocation after asynchronous authority
    // checks. The queue RPC also locks and rechecks device ownership/revocation.
    const currentAccount = await loadAccount(authenticatedAccountId, request.envelope.action);
    if (!currentAccount || currentAccount.userId !== authenticatedAccountId) return deny("Account authorization changed before enqueue.");
    const currentUser = accountPermissions(currentAccount, request.envelope.action);
    if (!currentUser || !authorizeExecution({ user: currentUser, capability: request.envelope.action, permission: request.envelope.action, riskLevel: "high", confirmed: true }).authorized) {
      return deny("Canonical account permission changed before enqueue.");
    }
    device = await loadDevice(authenticatedAccountId, request.deviceId);
    if (!usableDevice(device, authenticatedAccountId, request.deviceId, request.envelope.action)) {
      return deny("The requested device became unavailable before enqueue.");
    }

    const result = await queue.enqueue(authenticatedAccountId, request.deviceId, request.idempotencyKey, request.envelope);
    return {
      enqueued: true,
      created: result.created,
      command: {
        commandId: result.command.commandId,
        deviceId: result.command.deviceId,
        state: result.command.state,
        attempts: result.command.attempts,
        createdAt: result.command.createdAt,
      },
    };
  } catch {
    return deny("Device command authorization or queue service is unavailable.");
  }
}
