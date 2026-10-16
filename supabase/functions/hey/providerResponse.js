const MAX_PROVIDER_RESPONSE_BYTES = 1_000_000;

function cancelQuietly(stream) {
  try {
    const cancellation = stream?.cancel?.();
    if (cancellation && typeof cancellation.catch === "function") void cancellation.catch(() => {});
  } catch { /* Upstream cleanup must not delay a bounded failure path. */ }
}

export function cancelProviderResponse(response) {
  cancelQuietly(response?.body);
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
  if (!response || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return { status: "invalid" };
  const declaredLength = response.headers?.get?.("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    try { void Promise.resolve(response.body?.cancel?.()).catch(() => {}); } catch { /* Best-effort upstream cleanup. */ }
    return { status: "too_large" };
  }
  const reader = response.body?.getReader?.();
  if (!reader) return { status: "invalid" };
  const chunks = [];
  let totalBytes = 0;
  let interrupt;
  const interrupted = new Promise((resolve) => { interrupt = resolve; });
  const onAbort = () => interrupt({ status: "aborted" });
  const timer = setTimeout(() => interrupt({ status: "timeout" }), timeoutMs);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  try {
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
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        cancelBody(reader);
        return { status: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    cancelBody(reader);
    return { status: "invalid" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
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
