const MAX_PROVIDER_RESPONSE_BYTES = 1_000_000;
const MAX_PROVIDER_RESPONSE_CHUNKS = 4_096;

function cancelQuietly(stream) {
  try {
    const cancellation = stream?.cancel?.();
    if (cancellation && typeof cancellation.catch === "function") void cancellation.catch(() => {});
  } catch { /* Upstream cleanup must not delay a bounded failure path. */ }
}

export function cancelProviderResponse(response) {
  try { cancelQuietly(response?.body); } catch { /* Malformed response objects must not block fallback. */ }
}

function normaliseProviderContent(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === "string" ? part : part?.text || "")
      .join("")
      .trim();
  }
  return "";
}

/** Return usable text from supported provider response shapes, or an empty string. */
export function extractProviderText(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";

  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choiceMessage = choices[0]?.message;
  const choiceText = normaliseProviderContent(choiceMessage?.content);
  if (choiceText) return choiceText;

  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const candidateContent = candidates[0]?.content;
  const parts = Array.isArray(candidateContent?.parts) ? candidateContent.parts : [];
  return normaliseProviderContent(parts);
}

function cancelBody(reader) {
  cancelQuietly(reader);
}

/** Read provider JSON with a hard byte cap; malformed and oversized bodies fail closed. */
export async function readProviderJson(response, maxBytes = MAX_PROVIDER_RESPONSE_BYTES, { signal, timeoutMs = 10_000 } = {}) {
  if (!response) return { status: "invalid" };
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    cancelProviderResponse(response);
    return { status: "invalid" };
  }
  let declaredLength;
  try {
    declaredLength = response.headers?.get?.("content-length");
  } catch {
    cancelProviderResponse(response);
    return { status: "invalid" };
  }
  if (typeof declaredLength === "string" && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    cancelProviderResponse(response);
    return { status: "too_large" };
  }
  let reader;
  try {
    reader = response.body?.getReader?.();
  } catch {
    cancelProviderResponse(response);
    return { status: "invalid" };
  }
  if (!reader) {
    cancelProviderResponse(response);
    return { status: "invalid" };
  }
  let bytes = new Uint8Array(Math.min(maxBytes, 4_096));
  let totalBytes = 0;
  let chunkCount = 0;
  let interrupt;
  const interrupted = new Promise((resolve) => { interrupt = resolve; });
  const onAbort = () => interrupt({ status: "aborted" });
  const timer = setTimeout(() => interrupt({ status: "timeout" }), timeoutMs);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) {
      cancelBody(reader);
      return { status: "aborted" };
    }
    while (true) {
      const outcome = await Promise.race([
        reader.read().then((result) => ({ result }), () => ({ status: "invalid" })),
        interrupted,
      ]);
      if (outcome.status) {
        cancelBody(reader);
        return { status: outcome.status };
      }
      const { done, value } = outcome.result;
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        cancelBody(reader);
        return { status: "invalid" };
      }
      chunkCount += 1;
      if (chunkCount > MAX_PROVIDER_RESPONSE_CHUNKS) {
        cancelBody(reader);
        return { status: "too_fragmented" };
      }
      const nextTotalBytes = totalBytes + value.byteLength;
      if (nextTotalBytes > maxBytes) {
        cancelBody(reader);
        return { status: "too_large" };
      }
      if (nextTotalBytes > bytes.byteLength) {
        const nextCapacity = Math.min(maxBytes, Math.max(nextTotalBytes, bytes.byteLength * 2));
        const expanded = new Uint8Array(nextCapacity);
        expanded.set(bytes.subarray(0, totalBytes));
        bytes = expanded;
      }
      bytes.set(value, totalBytes);
      totalBytes = nextTotalBytes;
    }
  } catch {
    cancelBody(reader);
    return { status: "invalid" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    try { reader.releaseLock(); } catch { /* A failed stream may retain its lock. */ }
  }

  try {
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, totalBytes)));
    if (!data || typeof data !== "object" || Array.isArray(data)) return { status: "invalid" };
    return { status: "ok", data };
  } catch {
    return { status: "invalid" };
  }
}
