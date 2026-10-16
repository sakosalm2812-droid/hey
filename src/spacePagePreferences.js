const PREFERENCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const MAX_PREFERENCE_IDS = 32;

export function spacePreferencesMatchAccount(snapshot, accountId, activeScope, spaceId) {
  const expectedScope = accountId ? `account:${accountId}` : "";
  if (!snapshot || !accountId || activeScope !== expectedScope || snapshot.accountScope !== expectedScope || snapshot.spaceId !== spaceId) return false;
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) return false;
  return [snapshot.favoriteToolIds, snapshot.widgetIds, snapshot.shortcutIds].every((ids) => (
    Array.isArray(ids) && ids.length <= MAX_PREFERENCE_IDS &&
    ids.every((id) => typeof id === "string" && PREFERENCE_ID.test(id)) &&
    new Set(ids).size === ids.length
  ));
}

export function parseSpacePreferenceDraft(draft) {
  if (typeof draft !== "string") return { error: "Enter preference IDs one per line." };
  const values = draft.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (values.length > MAX_PREFERENCE_IDS) return { error: `Use no more than ${MAX_PREFERENCE_IDS} IDs in each category.` };
  if (values.some((value) => !PREFERENCE_ID.test(value))) return { error: "IDs must start with a letter or number and use only letters, numbers, dots, underscores, colons, or hyphens (up to 64 characters)." };
  if (new Set(values).size !== values.length) return { error: "Remove duplicate IDs before saving." };
  return { value: values };
}
