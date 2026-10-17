import { validateForgeArtifact as validateGeneratedForgeArtifact } from "../../supabase/functions/hey/forgeArtifact.js";

function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
}

function readData(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function isSafePath(path) {
  if (typeof path !== "string" || !path || path.length > 240 || path.startsWith("/") || path.includes("\\") ||
    Array.from(path).some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment && segment !== "." && segment !== "..");
}

function artifactFilename(title) {
  const slug = title.normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return `${slug || "hey-artifact"}.json`;
}

export function prepareForgeArtifactJson(artifact) {
  try {
    if (!isPlainRecord(artifact)) return null;
    const validation = readData(artifact, "validation");
    if (!isPlainRecord(validation) || readData(validation, "valid") !== true) return null;
    const title = readData(artifact, "title");
    const summary = readData(artifact, "summary");
    const filesDescriptor = Object.getOwnPropertyDescriptor(artifact, "files");
    const files = filesDescriptor && Object.hasOwn(filesDescriptor, "value") ? filesDescriptor.value : null;
    if (typeof title !== "string" || !title.trim() || title.length > 180 ||
      typeof summary !== "string" || summary.length > 4000 || !Array.isArray(files)) return null;

    const fileLengthDescriptor = Object.getOwnPropertyDescriptor(files, "length");
    const fileCount = fileLengthDescriptor?.value;
    if (!Number.isSafeInteger(fileCount) || fileCount < 1 || fileCount > 50) return null;
    let totalContentLength = 0;
    const seenPaths = new Set();
    const exportedFiles = [];
    for (let index = 0; index < fileCount; index += 1) {
      const fileDescriptor = Object.getOwnPropertyDescriptor(files, String(index));
      if (!fileDescriptor || !Object.hasOwn(fileDescriptor, "value") || !isPlainRecord(fileDescriptor.value)) return null;
      const file = fileDescriptor.value;
      const path = readData(file, "path");
      const content = readData(file, "content");
      const language = readData(file, "language");
      if (!isSafePath(path) || typeof content !== "string" || content.length > 1_000_000 ||
        (language !== undefined && (typeof language !== "string" || language.length > 40))) return null;
      if (seenPaths.has(path)) return null;
      seenPaths.add(path);
      totalContentLength += content.length;
      if (totalContentLength > 5_000_000) return null;
      exportedFiles.push({ path, language: language || "text", content });
    }
    if (!validateGeneratedForgeArtifact({ title, summary, files: exportedFiles }).valid) return null;

    const content = JSON.stringify({
      format: "hey.forge.artifact.v1",
      title: title.trim(),
      summary,
      files: exportedFiles,
    }, null, 2);
    return Object.freeze({ filename: artifactFilename(title), mimeType: "application/json;charset=utf-8", content });
  } catch {
    return null;
  }
}

export function downloadForgeArtifactJson(artifact, environment = {}) {
  const prepared = prepareForgeArtifactJson(artifact);
  if (!prepared) return { ok: false, error: "Only validated Forge artifacts with safe file paths can be exported." };

  const BlobConstructor = environment.Blob || globalThis.Blob;
  const urlApi = environment.URL || globalThis.URL;
  const documentRef = environment.document || globalThis.document;
  const schedule = environment.setTimeout || globalThis.setTimeout;
  if (typeof BlobConstructor !== "function" || typeof urlApi?.createObjectURL !== "function" ||
    typeof urlApi?.revokeObjectURL !== "function" || typeof documentRef?.createElement !== "function" ||
    typeof documentRef?.body?.appendChild !== "function" ||
    typeof schedule !== "function") {
    return { ok: false, error: "This browser cannot prepare a JSON download." };
  }

  let objectUrl = null;
  let anchor = null;
  let error = "The JSON download could not be started. Try again.";
  try {
    const blob = new BlobConstructor([prepared.content], { type: prepared.mimeType });
    objectUrl = urlApi.createObjectURL(blob);
    anchor = documentRef.createElement("a");
    anchor.href = objectUrl;
    anchor.download = prepared.filename;
    anchor.hidden = true;
    documentRef.body?.appendChild(anchor);
    anchor.click();
    error = "";
  } catch {
    // The caller gets a generic message; browser and artifact details stay local.
  } finally {
    try { anchor?.remove?.(); } catch { /* Cleanup must not mask the download result. */ }
    if (objectUrl) {
      try { schedule(() => urlApi.revokeObjectURL(objectUrl), 1000); } catch { /* Keep the URL alive if deferred cleanup is unavailable. */ }
    }
  }
  return error ? { ok: false, error } : { ok: true, filename: prepared.filename };
}
