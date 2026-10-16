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

function searchableText(tool) {
  try {
    const read = (record, key) => {
      if (!record || typeof record !== "object") return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
    };
    const readStrings = (value, childKey) => {
      if (!Array.isArray(value)) return [];
      const descriptors = Object.getOwnPropertyDescriptors(value);
      return Object.keys(descriptors)
        .filter((key) => /^(0|[1-9]\d*)$/u.test(key) && Object.hasOwn(descriptors[key], "value"))
        .map((key) => childKey ? read(descriptors[key].value, childKey) : descriptors[key].value)
        .filter((entry) => typeof entry === "string");
    };
    return [
      read(tool, "name"),
      read(tool, "description"),
      read(tool, "category"),
      ...readStrings(read(tool, "permissions")),
      ...readStrings(read(tool, "capabilities"), "capability"),
    ].filter((value) => typeof value === "string").join(" ").replaceAll(/[_-]+/gu, " ").toLocaleLowerCase();
  } catch {
    return "";
  }
}

export function isDictationDiscoveryQuery(query) {
  return typeof query === "string" && DICTATION_INTENT.test(query);
}

export function searchToolLibraryCatalog(tools, query) {
  if (!Array.isArray(tools)) return [];
  const normalizedQuery = typeof query === "string" ? query.trim().toLocaleLowerCase() : "";
  if (!normalizedQuery) return tools;

  const terms = new Set(normalizedQuery.match(/[\p{L}\p{N}]+/gu) || []);
  for (const word of STOP_WORDS) terms.delete(word);
  if (isDictationDiscoveryQuery(normalizedQuery)) DICTATION_TERMS.forEach((term) => terms.add(term));
  if (terms.size === 0) return [];

  return tools.map((tool, index) => {
    const text = searchableText(tool);
    let score = text.includes(normalizedQuery) ? 4 : 0;
    for (const term of terms) {
      if (text.includes(term)) score += term.includes(" ") ? 2 : 1;
    }
    return { tool, index, score };
  }).filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score || first.index - second.index)
    .map(({ tool }) => tool);
}
