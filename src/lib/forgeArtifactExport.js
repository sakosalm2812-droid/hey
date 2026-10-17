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

function artifactFilename(title, extension = "json") {
  const slug = title.normalize("NFKC").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return `${slug || "hey-artifact"}.${extension}`;
}

export function prepareForgeArtifactContent(artifact) {
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
    const normalizedTitle = title.trim();
    if (!validateGeneratedForgeArtifact({ title: normalizedTitle, summary, files: exportedFiles }).valid) return null;
    return Object.freeze({
      title: normalizedTitle,
      summary,
      files: Object.freeze(exportedFiles.map((file) => Object.freeze(file))),
    });
  } catch {
    return null;
  }
}

export function prepareForgeArtifactJson(artifact) {
  const validated = prepareForgeArtifactContent(artifact);
  if (!validated) return null;
  const content = JSON.stringify({
    format: "hey.forge.artifact.v1",
    ...validated,
  }, null, 2);
  return Object.freeze({ filename: artifactFilename(validated.title), mimeType: "application/json;charset=utf-8", content });
}

function buildParagraph(text, { bold = false, font = null, halfPoints = null } = {}) {
  const runProperties = [
    bold ? "<w:b/>" : "",
    font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>` : "",
    halfPoints ? `<w:sz w:val="${halfPoints}"/>` : "",
  ].join("");
  const safeText = xmlEscape(text);
  return `<w:p><w:r>${runProperties ? `<w:rPr>${runProperties}</w:rPr>` : ""}<w:t xml:space="preserve">${safeText || " "}</w:t></w:r></w:p>`;
}

function xmlEscape(value) {
  let escaped = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const validXml = codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    if (!validXml) {
      escaped += "\ufffd";
      continue;
    }
    escaped += ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character] || character;
  }
  return escaped;
}

function buildWordDocumentXml(artifact) {
  const paragraphs = [buildParagraph(artifact.title, { bold: true, halfPoints: 36 }), buildParagraph(artifact.summary)];
  for (const file of artifact.files) {
    paragraphs.push(buildParagraph(file.path, { bold: true, halfPoints: 28 }));
    for (const line of file.content.split(/\r\n|\r|\n/u)) {
      paragraphs.push(buildParagraph(line, { font: "Consolas", halfPoints: 20 }));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  if (length > 0xffffffff) throw new RangeError("The DOCX package is too large.");
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function buildStoredZip(entries) {
  if (!entries.length || entries.length > 0xffff) throw new RangeError("The DOCX package has an invalid part count.");
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const dosDate = 0x0021;
  for (const { name, text } of entries) {
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(text);
    if (nameBytes.length > 0xffff || contentBytes.length > 0xffffffff) throw new RangeError("The DOCX package contains an oversized part.");
    const checksum = crc32(contentBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, contentBytes.length, true);
    localView.setUint32(22, contentBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, contentBytes.length, true);
    centralView.setUint32(24, contentBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + contentBytes.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const centralOffset = localOffset;
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);
  return concatBytes([...localParts, centralDirectory, endRecord]);
}

export function prepareForgeArtifactDocx(artifact) {
  const validated = prepareForgeArtifactContent(artifact);
  if (!validated) return null;
  const documentXml = buildWordDocumentXml(validated);
  const corePropertiesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(validated.title)}</dc:title><dc:creator>HEY</dc:creator></cp:coreProperties>`;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const packageRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const bytes = buildStoredZip([
    { name: "[Content_Types].xml", text: contentTypesXml },
    { name: "_rels/.rels", text: packageRelationshipsXml },
    { name: "docProps/core.xml", text: corePropertiesXml },
    { name: "word/document.xml", text: documentXml },
  ]);
  return Object.freeze({ filename: artifactFilename(validated.title, "docx"), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes });
}

function downloadPreparedForgeArtifact(prepared, environment) {
  if (!prepared) return { ok: false, error: "Only validated Forge artifacts with safe file paths can be exported." };

  const BlobConstructor = environment.Blob || globalThis.Blob;
  const urlApi = environment.URL || globalThis.URL;
  const documentRef = environment.document || globalThis.document;
  const schedule = environment.setTimeout || globalThis.setTimeout;
  if (typeof BlobConstructor !== "function" || typeof urlApi?.createObjectURL !== "function" ||
    typeof urlApi?.revokeObjectURL !== "function" || typeof documentRef?.createElement !== "function" ||
    typeof documentRef?.body?.appendChild !== "function" ||
    typeof schedule !== "function") {
    const kind = prepared.mimeType === "application/json;charset=utf-8" ? "JSON" : "Word";
    return { ok: false, error: `This browser cannot prepare a ${kind} download.` };
  }

  let objectUrl = null;
  let anchor = null;
  let error = "The file download could not be started. Try again.";
  try {
    const blob = new BlobConstructor([prepared.content ?? prepared.bytes], { type: prepared.mimeType });
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

export function downloadForgeArtifactJson(artifact, environment = {}) {
  return downloadPreparedForgeArtifact(prepareForgeArtifactJson(artifact), environment);
}

export function downloadForgeArtifactDocx(artifact, environment = {}) {
  return downloadPreparedForgeArtifact(prepareForgeArtifactDocx(artifact), environment);
}
