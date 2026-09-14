import { safeStorage } from "../lib/safeStorage.js";

const FILE_OPERATIONS = Object.freeze({
  READ: "read",
  WRITE: "write",
  DELETE: "delete",
  COPY: "copy",
  MOVE: "move",
  CREATE_DIR: "create_dir",
  LIST: "list",
  STAT: "stat",
  SEARCH: "search",
  UPLOAD: "upload",
  DOWNLOAD: "download",
  ZIP: "zip",
  UNZIP: "unzip",
});

const MIME_CATEGORIES = Object.freeze({
  TEXT: ["text/plain", "text/markdown", "text/csv", "application/json", "text/html", "text/css", "text/javascript"],
  IMAGE: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp", "image/tiff"],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"],
  AUDIO: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/mp4"],
  DOCUMENT: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ARCHIVE: ["application/zip", "application/x-rar-compressed", "application/x-tar", "application/gzip"],
  CODE: ["text/javascript", "text/typescript", "text/x-python", "text/x-java", "text/x-c", "text/x-cpp", "text/x-go", "text/x-rust"],
});

const SEARCH_MODES = Object.freeze({
  EXACT: "exact",
  FUZZY: "fuzzy",
  SEMANTIC: "semantic",
  REGEX: "regex",
});

function generateFileId() {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateTransferId() {
  return `xfer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class FilesEngine {
  constructor() {
    this.roots = new Map();
    this.index = new Map();
    this.clipboard = null;
    this.clipboardHistory = [];
    this.transfers = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_files_engine");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.roots = new Map(Object.entries(parsed.roots || {}));
        this.clipboard = parsed.clipboard || null;
        this.clipboardHistory = parsed.clipboardHistory || [];
      }
    } catch (err) {
      console.warn("Failed to load files engine:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_files_engine", JSON.stringify({
        roots: Object.fromEntries(this.roots),
        clipboard: this.clipboard,
        clipboardHistory: this.clipboardHistory.slice(-100),
      }));
    } catch (err) {
      console.warn("Failed to save files engine:", err);
    }
  }

  addRoot(rootId, path, options = {}) {
    if (this.roots.has(rootId)) {
      return { error: "Root already exists" };
    }

    const root = {
      id: rootId,
      path,
      name: options.name || path.split("/").pop() || path,
      recursive: options.recursive !== false,
      includePatterns: options.includePatterns || ["**/*"],
      excludePatterns: options.excludePatterns || [],
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024,
      allowedMimeTypes: options.allowedMimeTypes || null,
      createdAt: new Date().toISOString(),
      indexedAt: null,
      fileCount: 0,
      totalSize: 0,
    };

    this.roots.set(rootId, root);
    this.save();
    this.notify("root_added", { rootId, root });
    return { success: true, root };
  }

  removeRoot(rootId) {
    if (!this.roots.has(rootId)) {
      return { error: "Root not found" };
    }

    this.roots.delete(rootId);
    this.rebuildIndex();
    this.save();
    return { success: true };
  }

  getRoot(rootId) {
    return this.roots.get(rootId) || null;
  }

  getAllRoots() {
    return Array.from(this.roots.values());
  }

  async indexRoot(rootId) {
    const root = this.roots.get(rootId);
    if (!root) return { error: "Root not found" };

    root.indexedAt = new Date().toISOString();
    this.roots.set(rootId, root);
    this.save();

    this.notify("indexing_started", { rootId });

    try {
      const files = await this.scanDirectory(root.path, root);
      let fileCount = 0;
      let totalSize = 0;

      for (const file of files) {
        this.index.set(file.id, file);
        fileCount++;
        totalSize += file.size;
      }

      root.fileCount = fileCount;
      root.totalSize = totalSize;
      root.indexedAt = new Date().toISOString();
      this.roots.set(rootId, root);
      this.save();

      this.notify("indexing_completed", { rootId, fileCount, totalSize });
      return { success: true, fileCount, totalSize };
    } catch (error) {
      this.notify("indexing_failed", { rootId, error: error.message });
      return { error: error.message };
    }
  }

  async scanDirectory(_dirPath, _root) {
    return [];
  }

  rebuildIndex() {
    this.index.clear();
    for (const root of this.roots.values()) {
      this.indexRoot(root.id);
    }
  }

  searchFiles(query, options = {}) {
    const {
      rootId = null,
      mode = SEARCH_MODES.EXACT,
      mimeTypes = null,
      maxResults = 100,
      includeContent = false,
    } = options;

    let files = Array.from(this.index.values());

    if (rootId) {
      files = files.filter(f => f.rootId === rootId);
    }

    if (mimeTypes && Array.isArray(mimeTypes)) {
      files = files.filter(f => mimeTypes.includes(f.mimeType));
    }

    let results;
    switch (mode) {
      case SEARCH_MODES.EXACT:
        results = files.filter(f => f.name === query);
        break;
      case SEARCH_MODES.FUZZY:
        results = files.filter(f => this.fuzzyMatch(f.name, query));
        break;
      case SEARCH_MODES.SEMANTIC:
        results = files.filter(f => this.semanticMatch(f, query));
        break;
      case SEARCH_MODES.REGEX:
        try {
          const regex = new RegExp(query, "i");
          results = files.filter(f => regex.test(f.name));
        } catch {
          results = [];
        }
        break;
      default:
        results = files.filter(f => f.name.includes(query));
    }

    results = results.slice(0, maxResults);

    if (!includeContent) {
      results = results.map(({ content: _content, ...rest }) => rest);
    }

    return results;
  }

  fuzzyMatch(text, query) {
    const t = text.toLowerCase();
    const q = query.toLowerCase();
    let i = 0, j = 0;
    while (i < t.length && j < q.length) {
      if (t[i] === q[j]) j++;
      i++;
    }
    return j === q.length;
  }

  semanticMatch(file, query) {
    const searchable = `${file.name} ${file.tags?.join(" ") || ""} ${file.description || ""}`.toLowerCase();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.every(term => searchable.includes(term));
  }

  async readFile(fileId) {
    const file = this.index.get(fileId);
    if (!file) return { error: "File not found" };

    return { success: true, file };
  }

  async writeFile(fileId, content, _options = {}) {
    const file = this.index.get(fileId);
    if (!file) return { error: "File not found" };

    return { success: true, file };
  }

  async deleteFile(fileId, options = {}) {
    const file = this.index.get(fileId);
    if (!file) return { error: "File not found" };

    if (options.useTrash !== false) {
      file.trashed = true;
      file.trashedAt = new Date().toISOString();
    } else {
      this.index.delete(fileId);
    }

    this.save();
    this.notify("file_deleted", { fileId, trashed: options.useTrash !== false });
    return { success: true };
  }

  async copyFile(fileId, targetRootId, _options = {}) {
    const file = this.index.get(fileId);
    if (!file) return { error: "File not found" };

    const newFile = {
      ...file,
      id: generateFileId(),
      rootId: targetRootId,
      createdAt: new Date().toISOString(),
    };

    this.index.set(newFile.id, newFile);
    this.save();
    this.notify("file_copied", { sourceId: fileId, targetId: newFile.id });
    return { success: true, file: newFile };
  }

  async moveFile(fileId, targetRootId, _options = {}) {
    const file = this.index.get(fileId);
    if (!file) return { error: "File not found" };

    const oldRootId = file.rootId;
    file.rootId = targetRootId;
    file.updatedAt = new Date().toISOString();

    this.index.set(fileId, file);
    this.save();
    this.notify("file_moved", { fileId, oldRootId, newRootId: targetRootId });
    return { success: true, file };
  }

  async createDirectory(rootId, path, _options = {}) {
    const root = this.roots.get(rootId);
    if (!root) return { error: "Root not found" };

    const dir = {
      id: generateFileId(),
      rootId,
      path,
      name: path.split("/").pop() || path,
      isDirectory: true,
      size: 0,
      mimeType: "inode/directory",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.index.set(dir.id, dir);
    this.save();
    this.notify("directory_created", { directory: dir });
    return { success: true, directory: dir };
  }

  async organizeFiles(rootId, rules) {
    const root = this.roots.get(rootId);
    if (!root) return { error: "Root not found" };

    const files = Array.from(this.index.values()).filter(f => f.rootId === rootId && !f.isDirectory);
    const results = { moved: 0, errors: [] };

    for (const file of files) {
      for (const rule of rules) {
        if (this.matchesRule(file, rule)) {
          const targetPath = this.applyRule(file, rule);
          await this.moveFile(file.id, rootId, { targetPath });
          results.moved++;
          break;
        }
      }
    }

    this.save();
    this.notify("files_organized", { rootId, results });
    return results;
  }

  matchesRule(file, rule) {
    if (rule.mimeTypes && !rule.mimeTypes.includes(file.mimeType)) return false;
    if (rule.namePattern) {
      const regex = new RegExp(rule.namePattern);
      if (!regex.test(file.name)) return false;
    }
    if (rule.minSize && file.size < rule.minSize) return false;
    if (rule.maxSize && file.size > rule.maxSize) return false;
    return true;
  }

  applyRule(file, rule) {
    return rule.targetPath.replace("{name}", file.name).replace("{ext}", file.name.split(".").pop());
  }

  getMimeCategory(mimeType) {
    for (const [category, types] of Object.entries(MIME_CATEGORIES)) {
      if (types.includes(mimeType)) return category;
    }
    return "OTHER";
  }

  validateMimeType(file, allowedTypes) {
    if (!allowedTypes || allowedTypes.length === 0) return true;
    return allowedTypes.includes(file.mimeType);
  }

  async uploadFile(rootId, file, _options = {}) {
    const root = this.roots.get(rootId);
    if (!root) return { error: "Root not found" };

    if (file.size > root.maxFileSize) {
      return { error: "File exceeds maximum size" };
    }

    if (!this.validateMimeType({ mimeType: file.type }, root.allowedMimeTypes)) {
      return { error: "File type not allowed" };
    }

    const transferId = generateTransferId();
    const transfer = {
      id: transferId,
      type: "upload",
      rootId,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      status: "uploading",
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.transfers.set(transferId, transfer);
    this.save();

    try {
      const fileId = generateFileId();
      const newFile = {
        id: fileId,
        rootId,
        name: file.name,
        path: _options.path || "/",
        mimeType: file.type,
        size: file.size,
        isDirectory: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.index.set(fileId, newFile);
      transfer.status = "completed";
      transfer.progress = 100;
      transfer.fileId = fileId;
      this.transfers.set(transferId, transfer);
      this.save();

      this.notify("upload_completed", { transferId, fileId });
      return { success: true, file: newFile, transfer };
    } catch (error) {
      transfer.status = "failed";
      transfer.error = error.message;
      this.transfers.set(transferId, transfer);
      this.save();
      return { error: error.message };
    }
  }

  async downloadFile(fileId, _options = {}) {
    const file = this.index.get(fileId);
    if (!file) return { error: "File not found" };

    const transferId = generateTransferId();
    const transfer = {
      id: transferId,
      type: "download",
      fileId,
      fileName: file.name,
      size: file.size,
      status: "downloading",
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.transfers.set(transferId, transfer);
    this.save();

    try {
      transfer.status = "completed";
      transfer.progress = 100;
      this.transfers.set(transferId, transfer);
      this.save();

      this.notify("download_completed", { transferId, fileId });
      return { success: true, file, transfer };
    } catch (error) {
      transfer.status = "failed";
      transfer.error = error.message;
      this.transfers.set(transferId, transfer);
      this.save();
      return { error: error.message };
    }
  }

  getClipboard() {
    return this.clipboard;
  }

  setClipboard(data, options = {}) {
    this.clipboard = {
      data,
      type: options.type || "text",
      timestamp: new Date().toISOString(),
    };

    if (!options.temporary) {
      this.clipboardHistory.unshift(this.clipboard);
      if (this.clipboardHistory.length > 100) this.clipboardHistory.pop();
    }

    this.save();
    this.notify("clipboard_updated", { clipboard: this.clipboard });
    return { success: true };
  }

  getClipboardHistory() {
    return this.clipboardHistory;
  }

  clearClipboardHistory() {
    this.clipboardHistory = [];
    this.save();
  }

  getTransfer(transferId) {
    return this.transfers.get(transferId) || null;
  }

  getAllTransfers() {
    return Array.from(this.transfers.values());
  }

  cancelTransfer(transferId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) return { error: "Transfer not found" };

    transfer.status = "cancelled";
    this.transfers.set(transferId, transfer);
    this.save();
    return { success: true };
  }

  getFileStats(rootId) {
    const files = Array.from(this.index.values()).filter(f => f.rootId === rootId && !f.trashed);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const byMime = {};
    for (const file of files) {
      byMime[file.mimeType] = (byMime[file.mimeType] || 0) + 1;
    }
    return { fileCount: files.length, totalSize, byMimeType: byMime };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Files listener error:", err); }
    });
  }
}

export const filesEngine = new FilesEngine();

export function addFileRoot(rootId, path, options) {
  return filesEngine.addRoot(rootId, path, options);
}

export function removeFileRoot(rootId) {
  return filesEngine.removeRoot(rootId);
}

export function getFileRoot(rootId) {
  return filesEngine.getRoot(rootId);
}

export function getAllFileRoots() {
  return filesEngine.getAllRoots();
}

export function indexFileRoot(rootId) {
  return filesEngine.indexRoot(rootId);
}

export function searchFiles(query, options) {
  return filesEngine.searchFiles(query, options);
}

export function readFile(fileId) {
  return filesEngine.readFile(fileId);
}

export function writeFile(fileId, content, options) {
  return filesEngine.writeFile(fileId, content, options);
}

export function deleteFile(fileId, options) {
  return filesEngine.deleteFile(fileId, options);
}

export function copyFile(fileId, targetRootId, options) {
  return filesEngine.copyFile(fileId, targetRootId, options);
}

export function moveFile(fileId, targetRootId, options) {
  return filesEngine.moveFile(fileId, targetRootId, options);
}

export function createDirectory(rootId, path, options) {
  return filesEngine.createDirectory(rootId, path, options);
}

export function organizeFiles(rootId, rules) {
  return filesEngine.organizeFiles(rootId, rules);
}

export function uploadFile(rootId, file, options) {
  return filesEngine.uploadFile(rootId, file, options);
}

export function downloadFile(fileId, options) {
  return filesEngine.downloadFile(fileId, options);
}

export function getClipboard() {
  return filesEngine.getClipboard();
}

export function setClipboard(data, options) {
  return filesEngine.setClipboard(data, options);
}

export function getClipboardHistory() {
  return filesEngine.getClipboardHistory();
}

export function clearClipboardHistory() {
  return filesEngine.clearClipboardHistory();
}

export function getTransfer(transferId) {
  return filesEngine.getTransfer(transferId);
}

export function getAllTransfers() {
  return filesEngine.getAllTransfers();
}

export function cancelTransfer(transferId) {
  return filesEngine.cancelTransfer(transferId);
}

export function getFileStats(rootId) {
  return filesEngine.getFileStats(rootId);
}

export function subscribeToFiles(listener) {
  return filesEngine.subscribe(listener);
}

export { FILE_OPERATIONS, MIME_CATEGORIES, SEARCH_MODES };

export default filesEngine;
