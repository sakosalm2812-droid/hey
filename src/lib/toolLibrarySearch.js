const STOP_WORDS = new Set(["a", "an", "and", "any", "app", "apps", "for", "i", "in", "me", "my", "the", "to", "want", "with"]);
const DICTATION_TERMS = Object.freeze([
  "dictat",
  "voice typing",
  "speech recognition",
  "speech to text",
  "transcription",
  "microphone input",
]);
const DICTATION_INTENT = /\b(dictat\w*|voice typing|speech recognition|speech[- ]to[- ]text|transcri\w*|talk instead of typing|speak instead of typing)\b/iu;
const MAX_CATALOG_TOOLS = 256;
const MAX_METADATA_ITEMS = 64;
const MAX_QUERY_CHARS = 256;
const MAX_QUERY_TERMS = 32;
const MAX_SEARCHABLE_CHARS = 4096;

function searchableText(tool) {
  try {
    const read = (record, key) => {
      if (!record || typeof record !== "object") return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
    };
    const readStrings = (value, childKey) => {
      if (!Array.isArray(value)) return [];
      const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_METADATA_ITEMS) return [];
      const entries = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, "value")) continue;
        const entry = childKey ? read(descriptor.value, childKey) : descriptor.value;
        if (typeof entry === "string") entries.push(entry);
      }
      return entries;
    };
    return [
      read(tool, "name"),
      read(tool, "description"),
      read(tool, "category"),
      ...readStrings(read(tool, "permissions")),
      ...readStrings(read(tool, "capabilities"), "capability"),
    ].filter((value) => typeof value === "string").join(" ").slice(0, MAX_SEARCHABLE_CHARS).replaceAll(/[_-]+/gu, " ").toLocaleLowerCase();
  } catch {
    return "";
  }
}

export function isDictationDiscoveryQuery(query) {
  return typeof query === "string" && query.length <= MAX_QUERY_CHARS && DICTATION_INTENT.test(query);
}

export function searchToolLibraryCatalog(tools, query) {
  if (!Array.isArray(tools)) return [];
  if (typeof query === "string" && query.length > MAX_QUERY_CHARS) return [];
  const normalizedQuery = typeof query === "string" && query.length <= MAX_QUERY_CHARS ? query.trim().toLocaleLowerCase() : "";
  if (!normalizedQuery) return tools;

  const terms = new Set((normalizedQuery.match(/[\p{L}\p{N}]+/gu) || []).slice(0, MAX_QUERY_TERMS));
  for (const word of STOP_WORDS) terms.delete(word);
  if (isDictationDiscoveryQuery(normalizedQuery)) DICTATION_TERMS.forEach((term) => terms.add(term));
  if (terms.size === 0) return [];

  try {
    const length = Object.getOwnPropertyDescriptor(tools, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_CATALOG_TOOLS) return [];
    const matches = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(tools, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, "value")) continue;
      const tool = descriptor.value;
      const text = searchableText(tool);
      let score = text.includes(normalizedQuery) ? 4 : 0;
      for (const term of terms) {
        if (text.includes(term)) score += term.includes(" ") ? 2 : 1;
      }
      if (score > 0) matches.push({ tool, index, score });
    }
    return matches
      .sort((first, second) => second.score - first.score || first.index - second.index)
      .map(({ tool }) => tool);
  } catch {
    return [];
  }
}
