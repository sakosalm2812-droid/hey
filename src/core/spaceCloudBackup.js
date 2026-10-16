import { getAccountScope } from "./accountScope.js";
import { supabaseClient } from "../lib/supabase.js";

const TABLE = "hey_private_space_backups";
const MAX_BACKUP_BYTES = 1_016_384;
const MAX_SPACES = 1_000;
const SPACE_FIELDS = ["id", "name", "description", "templateId", "detailsRevision", "status", "lifecycleRevision", "visibility", "sharing", "createdAt", "layoutPreferences"];
const ENVELOPE_FIELDS = ["kind", "contractVersion", "exportedAt", "spaceCount", "spaces"];

function hasControlCharacters(text) {
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

function readDataRecord(value, allowedKeys) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Backup record must be an object" };
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return { error: "Backup record must be plain data" };
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length) return { error: "Backup record contains unsupported fields" };
    const result = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!allowedKeys.includes(key)) return { error: "Backup record contains unsupported fields" };
      if (!Object.hasOwn(descriptor, "value")) return { error: "Backup record contains accessor properties" };
      result[key] = descriptor.value;
    }
    return { value: result };
  } catch {
    return { error: "Backup record could not be safely inspected" };
  }
}

function validatePreferenceRecord(value) {
  const safe = readDataRecord(value, ["contractVersion", "revision", "favoriteToolIds", "widgetIds", "shortcutIds", "toolIds"]);
  if (safe.error) return safe;
  const input = safe.value;
  if (input.contractVersion !== 1 || !Number.isSafeInteger(input.revision) || input.revision < 0) return { error: "Space backup preferences are invalid" };
  for (const key of ["favoriteToolIds", "widgetIds", "shortcutIds", "toolIds"]) {
    const values = input[key];
    const toolIds = key === "toolIds";
    const safeId = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
    if (!Object.hasOwn(input, key) || !Array.isArray(values) || values.length > (toolIds ? 64 : 32)
      || values.some((id) => typeof id !== "string" || (toolIds
        ? (id !== id.trim() || id.length > 160 || hasControlCharacters(id))
        : !safeId.test(id)))
      || new Set(values).size !== values.length) {
      return { error: "Space backup preferences are invalid" };
    }
  }
  return { value: input };
}

function validatePortableDocument(value) {
  const safe = readDataRecord(value, ENVELOPE_FIELDS);
  if (safe.error) return safe;
  const document = safe.value;
  if (document.kind !== "hey-private-spaces-export" || document.contractVersion !== 1
    || typeof document.exportedAt !== "string" || !Number.isFinite(Date.parse(document.exportedAt))
    || !Array.isArray(document.spaces) || !Number.isSafeInteger(document.spaceCount)
    || document.spaceCount !== document.spaces.length || document.spaces.length > MAX_SPACES) {
    return { error: "Space account backup format is invalid" };
  }
  const seenIds = new Set();
  const safeSpaceName = /^[\p{L}\p{N}][\p{L}\p{N} ._'’()-]{0,79}$/u;
  for (const spaceValue of document.spaces) {
    const spaceRecord = readDataRecord(spaceValue, SPACE_FIELDS);
    if (spaceRecord.error) return spaceRecord;
    const space = spaceRecord.value;
    if (SPACE_FIELDS.some((field) => !Object.hasOwn(space, field))
      || typeof space.id !== "string" || !space.id || space.id.length > 100 || seenIds.has(space.id)
      || typeof space.name !== "string" || !safeSpaceName.test(space.name)
      || typeof space.description !== "string" || space.description.length > 240 || hasControlCharacters(space.description)
      || !["empty", "planning", "research", "custom"].includes(space.templateId)
      || !Number.isSafeInteger(space.detailsRevision) || space.detailsRevision < 0
      || !["active", "archived"].includes(space.status)
      || !Number.isSafeInteger(space.lifecycleRevision) || space.lifecycleRevision < 0
      || space.visibility !== "private" || space.sharing !== "off"
      || !(space.createdAt === null || (typeof space.createdAt === "string" && space.createdAt.length <= 64
        && !hasControlCharacters(space.createdAt) && Number.isFinite(Date.parse(space.createdAt))))) {
      return { error: "Space account backup contains invalid or non-private data" };
    }
    const preferences = validatePreferenceRecord(space.layoutPreferences);
    if (preferences.error) return preferences;
    seenIds.add(space.id);
  }
  return { value: document };
}

function validateExportJson(exportJson) {
  if (typeof exportJson !== "string" || exportJson.length > MAX_BACKUP_BYTES
    || new TextEncoder().encode(exportJson).length > MAX_BACKUP_BYTES) return { error: "Space account backup is too large" };
  let parsed;
  try { parsed = JSON.parse(exportJson); } catch { return { error: "Space account backup is not valid JSON" }; }
  return validatePortableDocument(parsed);
}

export class SpaceCloudBackupService {
  constructor(client = supabaseClient, accountScope = getAccountScope) {
    this.client = client;
    this.accountScope = accountScope;
  }

  async authorize(accountId) {
    if (typeof accountId !== "string" || !accountId || accountId.length > 128) return { error: "A signed-in account is required" };
    const scope = `account:${accountId}`;
    if (this.accountScope() !== scope) return { error: "Account scope mismatch" };
    if (typeof this.client?.auth?.getUser !== "function") return { error: "Account backup service is unavailable" };
    let auth;
    try { auth = await this.client.auth.getUser(); } catch { return { error: "The signed-in account could not be verified" }; }
    if (auth?.error || auth?.data?.user?.id !== accountId || this.accountScope() !== scope) {
      return { error: "The signed-in account could not be verified" };
    }
    return { accountId, accountScope: scope };
  }

  async read(request) {
    const safe = readDataRecord(request, ["accountId"]);
    if (safe.error) return safe;
    const authorized = await this.authorize(safe.value.accountId);
    if (authorized.error) return authorized;
    let response;
    try {
      response = await this.client.from(TABLE).select("user_id,document,revision,updated_at")
        .eq("user_id", authorized.accountId).maybeSingle();
    } catch {
      return { error: "The account backup could not be read" };
    }
    if (this.accountScope() !== authorized.accountScope) return { error: "Account scope changed; retry the backup check" };
    if (response?.error) return { error: "The account backup could not be read" };
    if (response?.data == null) return { success: true, accountScope: authorized.accountScope, revision: 0, updatedAt: null, document: null, spaceCount: 0 };
    const row = readDataRecord(response.data, ["user_id", "document", "revision", "updated_at"]);
    if (row.error || row.value.user_id !== authorized.accountId || !Number.isSafeInteger(row.value.revision)
      || row.value.revision < 1 || typeof row.value.updated_at !== "string" || !Number.isFinite(Date.parse(row.value.updated_at))) {
      return { error: "The account backup record is invalid" };
    }
    const document = validatePortableDocument(row.value.document);
    if (document.error) return { error: document.error };
    return { success: true, accountScope: authorized.accountScope, revision: row.value.revision, updatedAt: row.value.updated_at, document: document.value, spaceCount: document.value.spaceCount };
  }

  async save(request) {
    const safe = readDataRecord(request, ["accountId", "expectedRevision", "exportJson"]);
    if (safe.error) return safe;
    const { accountId, expectedRevision, exportJson } = safe.value;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2_147_483_647) {
      return { error: "A valid account backup revision is required" };
    }
    const document = validateExportJson(exportJson);
    if (document.error) return document;
    const authorized = await this.authorize(accountId);
    if (authorized.error) return authorized;
    let response;
    try {
      response = await this.client.rpc("save_hey_private_space_backup", {
        p_document: document.value,
        p_expected_revision: expectedRevision,
      });
    } catch {
      return { error: "The account backup could not be saved" };
    }
    if (this.accountScope() !== authorized.accountScope) return { error: "Account scope changed; retry the backup save" };
    if (response?.error) return { error: "The account backup could not be saved" };
    const rowValue = Array.isArray(response?.data) ? response.data[0] : response?.data;
    const row = readDataRecord(rowValue, ["success", "revision", "updated_at"]);
    if (row.error || typeof row.value.success !== "boolean" || !Number.isSafeInteger(row.value.revision) || row.value.revision < 0) {
      return { error: "The account backup service returned an invalid result" };
    }
    if (!row.value.success) return { error: "The account backup changed on another device; review it again before replacing it", code: "stale_snapshot", revision: row.value.revision };
    if (typeof row.value.updated_at !== "string" || !Number.isFinite(Date.parse(row.value.updated_at))) {
      return { error: "The account backup service returned an invalid result" };
    }
    return { success: true, accountScope: authorized.accountScope, revision: row.value.revision, updatedAt: row.value.updated_at, spaceCount: document.value.spaceCount };
  }
}

const defaultService = new SpaceCloudBackupService();
export function readPrivateSpaceCloudBackup(request) {
  return defaultService.read(request);
}
export function savePrivateSpaceCloudBackup(request) {
  return defaultService.save(request);
}
