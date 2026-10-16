export function getSafePostLoginPath(candidate, origin) {
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || [...candidate].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  })) {
    return "/chat";
  }
  try {
    const target = new URL(candidate, origin);
    if (target.origin !== origin) return "/chat";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/chat";
  }
}
