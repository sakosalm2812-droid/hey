const MAX_PROVIDER_RESPONSE_BYTES = 1_000_000;

function cancelBody(reader) {
  try { void Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* The stream may already be closed. */ }
}

/** Read provider JSON with a hard byte cap; malformed and oversized bodies fail closed. */
export async function readProviderJson(response, maxBytes = MAX_PROVIDER_RESPONSE_BYTES) {
  if (!response || !Number.isSafeInteger(maxBytes) || maxBytes < 1) return { status: "invalid" };
  const declaredLength = response.headers?.get?.("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    try { await response.body?.cancel?.(); } catch { /* Best-effort upstream cleanup. */ }
    return { status: "too_large" };
  }
  const reader = response.body?.getReader?.();
  if (!reader) return { status: "invalid" };
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        cancelBody(reader);
        return { status: "invalid" };
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch { /* Best-effort upstream cleanup. */ }
        return { status: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    cancelBody(reader);
    return { status: "invalid" };
  } finally {
    try { reader.releaseLock(); } catch { /* A failed stream may retain its lock. */ }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data)) return { status: "invalid" };
    return { status: "ok", data };
  } catch {
    return { status: "invalid" };
  }
}
