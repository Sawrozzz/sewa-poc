/**
 * IndexedDB-backed cache for mini-app plugin bundles.
 *
 * Handles downloading, storing, and retrieving mini-app assets.
 * Supports FIFO eviction to maintain cache size limits.
 * Provides both in-memory and persistent storage layers.
 */

import type { PluginLoadOptions } from "@sewa/host-platform";
import type {
  BundleContents,
  CachedBinaryFile,
  CachedFile,
  CacheOrder,
  ViteManifest,
} from "./types";

/** IndexedDB database name */
const DB_NAME = "sewa-plugin-cache";

/** Object store name for cached files */
const STORE_NAME = "modules";

/** IndexedDB version (increment to trigger schema upgrade) */
const DB_VERSION = 2;

export class PluginCacheDB {
  private db: IDBDatabase | null = null;
  private _manifestCache: Record<string, string> | null = null;
  private _fetcher: typeof fetch;
  private maxModules: number;
  private moduleOrder: string[] = [];
  private orderLoaded = false;

  /**
   * Create a new PluginCacheDB instance.
   * @param fetcher - Custom fetch function (default: global fetch)
   * @param maxModules - Maximum modules to keep in cache (default: 1)
   */
  constructor(fetcher?: typeof fetch, maxModules: number = 1) {
    this._fetcher = fetcher ?? fetch.bind(globalThis);
    this.maxModules = maxModules;
  }

  /**
   * Restore cache order from IndexedDB.
   * Called once on first access to persist order across page reloads.
   */
  private async getCacheOrder(): Promise<string[]> {
    if (this.orderLoaded) return this.moduleOrder;
    try {
      const db = await this.open();
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get("__cache-order__");
      return new Promise((resolve) => {
        req.onsuccess = () => {
          this.moduleOrder = (req.result as CacheOrder)?.data ?? [];
          this.orderLoaded = true;
          resolve(this.moduleOrder);
        };
        req.onerror = () => {
          this.moduleOrder = [];
          this.orderLoaded = true;
          resolve([]);
        };
      });
    } catch {
      this.moduleOrder = [];
      this.orderLoaded = true;
      return [];
    }
  }

  /**
   * Persist cache order to IndexedDB.
   * Saves the current module access order for FIFO eviction.
   */
  private async saveCacheOrder(): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put({
        fileKey: "__cache-order__",
        data: this.moduleOrder,
        cachedAt: Date.now(),
      } as CacheOrder);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Enforce cache limit using FIFO eviction.
   * When the number of cached modules exceeds maxModules,
   * the oldest cached module is removed first.
   * @param newModuleId - ID of the module being added to cache
   */
  private async enforceCacheLimit(newModuleId: string): Promise<void> {
    await this.getCacheOrder();

    // Move newModuleId to the end (most recently cached)
    this.moduleOrder = this.moduleOrder.filter((id) => id !== newModuleId);
    this.moduleOrder.push(newModuleId);

    // FIFO: evict from the front (oldest entries)
    const evicted: string[] = [];
    while (this.moduleOrder.length > this.maxModules) {
      const evictedId = this.moduleOrder.shift();
      if (evictedId !== undefined) evicted.push(evictedId);
    }

    if (evicted.length > 0) {
      await Promise.all(
        evicted.map((id) =>
          this.deleteModule(id).catch((err) =>
            console.warn("[PluginCacheDB] Eviction failed for:", id, err),
          ),
        ),
      );
    }

    await this.saveCacheOrder();
  }

  /**
   * Open or create the IndexedDB database.
   * Handles schema creation and upgrades.
   */
  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "fileKey" });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };
      req.onerror = () => {
        console.error("[PluginCacheDB] Open failed:", req.error);
        reject(req.error);
      };
      req.onblocked = () => {
        console.warn("[PluginCacheDB] Open blocked — check for other tabs with this DB open");
      };
    });
  }

  /**
   * Download all files from a directory URL and store in IndexedDB.
   *
   * Fetches directory listing (HTML or provided file list), downloads each file,
   * and stores them with module-scoped keys. Optionally stores Vite manifest.
   *
   * @param baseUrl - Base URL of the directory to download
   * @param moduleId - Module ID for cache scoping
   * @param _options - Plugin load options (unused, kept for API compatibility)
   * @param specificFiles - Optional list of specific files to download
   * @param viteManifest - Optional Vite manifest to store
   * @returns Record of downloaded files (fileName -> content)
   */
  async downloadDirectory(
    baseUrl: string,
    moduleId: string,
    _options: PluginLoadOptions,
    specificFiles?: string[],
    viteManifest?: ViteManifest | null,
  ): Promise<Record<string, string>> {
    console.log(
      "[PluginCacheDB] downloadDirectory START — moduleId:",
      moduleId,
      "baseUrl:",
      baseUrl,
      "specificFiles:",
      specificFiles,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      let fileNames: string[];
      if (specificFiles && specificFiles.length > 0) {
        fileNames = specificFiles;
      } else {
        fileNames = [];
        try {
          const res = await this._fetcher(baseUrl, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (res.ok) {
            const text = await res.text();
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("text/html")) {
              const hrefRegex = /href="([^"]+)"/g;
              for (const match of text.matchAll(hrefRegex)) {
                const href = match[1];
                const cleanName = href.includes("/")
                  ? href.substring(href.lastIndexOf("/") + 1)
                  : href;
                if (cleanName.endsWith(".js") || cleanName.endsWith(".css")) {
                  fileNames.push(cleanName);
                }
              }
            }
          }
        } catch (error) {
          console.error("[PluginCacheDB] Directory listing fetch failed:", error);
        }
      }

      console.log(
        "[PluginCacheDB] Discovered fileNames:",
        fileNames.length,
        "— using fallback:",
        fileNames.length === 0,
      );
      const filesToFetch = fileNames.length > 0 ? fileNames : ["index.js"];
      console.log("[PluginCacheDB] filesToFetch:", filesToFetch);

      // Download each file
      const files: Record<string, string> = {};
      const baseUrlNoSlash = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
      const fetchPromises = filesToFetch.map(async (fileName) => {
        const url = `${baseUrlNoSlash}/${fileName}`;
        console.log("[PluginCacheDB] Fetching file:", url);
        const fileRes = await this._fetcher(url, {
          signal: controller.signal,
          cache: "no-store",
        });
        console.log("[PluginCacheDB] Fetched file:", url, "status:", fileRes.status);
        if (!fileRes.ok) {
          console.error(
            "[PluginCacheDB] Failed to fetch file:",
            url,
            fileRes.status,
            fileRes.statusText,
          );
          return;
        }
        const text = await fileRes.text();
        files[fileName] = text;
        console.log(
          "[PluginCacheDB] Successfully downloaded:",
          fileName,
          "size:",
          text.length,
          "bytes",
        );
      });

      await Promise.all(fetchPromises);
      console.log("[PluginCacheDB] All files downloaded:", Object.keys(files));

      // Store each file in IndexedDB
      const db = await this.open();
      const putPromises: Promise<void>[] = [];
      for (const [fileName, content] of Object.entries(files)) {
        putPromises.push(
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const req = tx.objectStore(STORE_NAME).put({
              fileKey: `${moduleId}/${fileName}`,
              data: content,
              cachedAt: Date.now(),
            } as CachedFile);
            req.onsuccess = () => {
              resolve();
            };
            req.onerror = () => reject(req.error);
          }),
        );
      }

      // Store Vite manifest if provided
      if (viteManifest) {
        putPromises.push(
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const req = tx.objectStore(STORE_NAME).put({
              fileKey: `${moduleId}/manifest`,
              data: JSON.stringify(viteManifest),
              cachedAt: Date.now(),
            } as CachedFile);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          }),
        );
        files.manifest = JSON.stringify(viteManifest);
      }

      await Promise.all(putPromises);
      console.log("[PluginCacheDB] All files stored in IndexedDB for:", moduleId);

      // Update in-memory cache (scoped keys, matching IndexedDB)
      if (!this._manifestCache) this._manifestCache = {};
      for (const [fileName, content] of Object.entries(files)) {
        this._manifestCache[`${moduleId}/${fileName}`] = content;
      }

      // Enforce cache limit using FIFO eviction
      await this.enforceCacheLimit(moduleId);

      console.log(
        "[PluginCacheDB] downloadDirectory COMPLETE — moduleId:",
        moduleId,
        "files:",
        Object.keys(files),
      );
      return files;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get a single file from the cached directory.
   * First checks the in-memory cache, then falls back to IndexedDB.
   *
   * @param moduleId - Module ID containing the file
   * @param fileName - Name of the file to retrieve
   * @returns File content or null if not found
   */
  async getFile(moduleId: string, fileName: string): Promise<string | null> {
    const scopedKey = `${moduleId}/${fileName}`;

    // Check in-memory cache first (fast path)
    if (this._manifestCache && this._manifestCache[scopedKey] !== undefined) {
      console.log("[PluginCacheDB] getFile CACHE HIT —", scopedKey);
      return this._manifestCache[scopedKey];
    }

    console.log("[PluginCacheDB] getFile cache miss, checking IndexedDB —", scopedKey);

    // Fall back to IndexedDB
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(scopedKey);
      req.onsuccess = () => {
        const result = req.result as (CachedFile & { binary?: true }) | undefined;
        // Binary records are read through getBinary() — returning their bytes
        // here would poison the in-memory string cache.
        if (result?.binary) {
          resolve(null);
          return;
        }
        if (result) {
          console.log(
            "[PluginCacheDB] getFile IndexedDB HIT —",
            scopedKey,
            "dataLength:",
            result.data?.length,
          );
          // Populate in-memory cache for future access
          if (!this._manifestCache) this._manifestCache = {};
          this._manifestCache[result.fileKey] = result.data;
          resolve(result.data ?? null);
        } else {
          console.log("[PluginCacheDB] getFile IndexedDB MISS —", scopedKey);
          resolve(null);
        }
      };
      req.onerror = () => {
        console.error("[PluginCacheDB] getFile IndexedDB error —", scopedKey, req.error);
        reject(req.error);
      };
    });
  }

  /**
   * Check if a directory has been downloaded and stored.
   * Searches for any entry with the moduleId prefix.
   *
   * @param moduleId - Module ID to check
   * @returns True if any files for this module exist in cache
   */
  async hasDirectory(moduleId: string): Promise<boolean> {
    console.log("[PluginCacheDB] hasDirectory — moduleId:", moduleId);

    // Check in-memory cache first
    if (
      this._manifestCache &&
      Object.keys(this._manifestCache).some((k) => k.startsWith(`${moduleId}/`))
    ) {
      console.log("[PluginCacheDB] hasDirectory — memory cache HIT for:", moduleId);
      return true;
    }

    console.log("[PluginCacheDB] hasDirectory — checking IndexedDB for:", moduleId);

    // Check IndexedDB using cursor iteration
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const key = cursor.key as string;
            if (key.startsWith(`${moduleId}/`)) {
              resolve(true);
            } else {
              cursor.continue();
            }
          } else {
            console.log("[PluginCacheDB] hasDirectory — no match found for:", moduleId);
            resolve(false);
          }
        };
        cursorReq.onerror = () => {
          console.error("[PluginCacheDB] hasDirectory cursor error:", cursorReq.error);
          resolve(false);
        };
      });
    } catch (err) {
      console.error("[PluginCacheDB] hasDirectory exception:", err);
      return false;
    }
  }

  /**
   * Get the cached version marker for a module.
   * Returns null when no marker has been stored.
   *
   * @param moduleId - Module ID to look up
   * @returns The stored version string or null
   */
  async getVersion(moduleId: string): Promise<string | null> {
    const scopedKey = `${moduleId}/__version__`;
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(scopedKey);
        req.onsuccess = () => {
          const result = req.result as CachedFile | undefined;
          resolve(result?.data ?? null);
        };
        req.onerror = () => resolve(null);
      });
    } catch (err) {
      console.warn("[PluginCacheDB] getVersion failed for:", moduleId, err);
      return null;
    }
  }

  /**
   * Store the version marker for a module alongside its cached files.
   *
   * @param moduleId - Module ID to tag
   * @param version - Version string to persist
   */
  async setVersion(moduleId: string, version: string): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put({
        fileKey: `${moduleId}/__version__`,
        data: version,
        cachedAt: Date.now(),
      } as CachedFile);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get the archive digest a cached bundle was verified against.
   *
   * Used as the cache key for the signed-manifest flow: when the manifest's
   * `bundleHash` still matches this value, the whole download → hash → unzip
   * cycle is skipped and the extracted files are read straight from IndexedDB.
   *
   * @param moduleId - Module ID to look up
   * @returns The stored digest, or null when the module was never cached
   */
  async getBundleHash(moduleId: string): Promise<string | null> {
    return this.getFile(moduleId, "__bundleHash__");
  }

  /**
   * Record the archive digest a cached bundle was verified against.
   *
   * @param moduleId - Module ID to tag
   * @param bundleHash - Digest string from the manifest
   */
  async setBundleHash(moduleId: string, bundleHash: string): Promise<void> {
    await this.putText(moduleId, "__bundleHash__", bundleHash);
  }

  /**
   * Store a single text file under a module-scoped key.
   *
   * @param moduleId - Module ID for cache scoping
   * @param fileName - File name (archive path) to store under
   * @param content - File content
   */
  async putText(moduleId: string, fileName: string, content: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put({
        fileKey: `${moduleId}/${fileName}`,
        data: content,
        cachedAt: Date.now(),
      } as CachedFile);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    if (!this._manifestCache) this._manifestCache = {};
    this._manifestCache[`${moduleId}/${fileName}`] = content;
  }

  /**
   * Store raw bytes under a module-scoped key.
   *
   * Binary records never enter the in-memory string cache — they are read back
   * through {@link getBinary}.
   *
   * @param moduleId - Module ID for cache scoping
   * @param fileName - File name (archive path) to store under
   * @param bytes - Raw file bytes
   * @param mimeType - MIME type to serve the bytes with
   */
  async putBinary(
    moduleId: string,
    fileName: string,
    bytes: ArrayBuffer,
    mimeType = "application/octet-stream",
  ): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).put({
        fileKey: `${moduleId}/${fileName}`,
        data: bytes,
        binary: true,
        mimeType,
        cachedAt: Date.now(),
      } as CachedBinaryFile);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Read raw bytes previously stored by {@link putBinary}.
   *
   * @param moduleId - Module ID containing the file
   * @param fileName - File name (archive path) to retrieve
   * @returns The bytes and MIME type, or null when absent
   */
  async getBinary(
    moduleId: string,
    fileName: string,
  ): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(`${moduleId}/${fileName}`);
      req.onsuccess = () => {
        const result = req.result as CachedBinaryFile | undefined;
        if (!result?.data) {
          resolve(null);
          return;
        }
        resolve({ bytes: result.data, mimeType: result.mimeType ?? "application/octet-stream" });
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Delete a single cached file.
   *
   * Used to drop the downloaded `.zip` once it has been verified and unpacked —
   * the archive itself is never kept, only its extracted contents.
   *
   * @param moduleId - Module ID containing the file
   * @param fileName - File name (archive path) to delete
   */
  async deleteFile(moduleId: string, fileName: string): Promise<void> {
    const scopedKey = `${moduleId}/${fileName}`;
    if (this._manifestCache) delete this._manifestCache[scopedKey];
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).delete(scopedKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Persist the full contents of an unpacked mini-app bundle.
   *
   * Any previously cached files for the module are cleared first so a new
   * release never leaves orphaned assets behind, then the extracted text and
   * binary entries are written and the module joins the FIFO eviction order.
   *
   * @param moduleId - Module ID for cache scoping
   * @param contents - Text and binary entries unpacked from the archive
   * @param meta - Digest and version markers to store alongside the files
   */
  async storeBundle(
    moduleId: string,
    contents: BundleContents,
    meta: { bundleHash: string; version?: string },
  ): Promise<void> {
    await this.deleteModule(moduleId);

    for (const [fileName, content] of Object.entries(contents.text)) {
      await this.putText(moduleId, fileName, content);
    }
    for (const [fileName, asset] of Object.entries(contents.binary)) {
      await this.putBinary(moduleId, fileName, asset.bytes, asset.mimeType);
    }

    await this.setBundleHash(moduleId, meta.bundleHash);
    if (meta.version) await this.setVersion(moduleId, meta.version);

    await this.enforceCacheLimit(moduleId);
    console.log(
      "[PluginCacheDB] storeBundle COMPLETE — moduleId:",
      moduleId,
      "text:",
      Object.keys(contents.text),
      "binary:",
      Object.keys(contents.binary),
    );
  }

  /**
   * Delete all cached files for a module.
   * Removes both in-memory and IndexedDB entries.
   *
   * @param moduleId - Module ID to delete from cache
   */
  async deleteModule(moduleId: string): Promise<void> {
    // Clear in-memory cache
    if (this._manifestCache) {
      Object.keys(this._manifestCache).forEach((k) => {
        if (k.startsWith(`${moduleId}/`)) delete this._manifestCache?.[k];
      });
    }

    // Delete from IndexedDB using cursor iteration
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            if ((cursor.key as string).startsWith(`${moduleId}/`)) {
              cursor.delete();
            }
            cursor.continue();
          }
        };
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("[PluginCacheDB] Failed to clear directory data for:", moduleId, err);
    }
  }

  /**
   * Clear all cached data.
   * Resets both in-memory and IndexedDB storage.
   */
  async clear(): Promise<void> {
    this._manifestCache = null;
    this.moduleOrder = [];
    this.orderLoaded = true;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Destroy the cache instance.
   * Clears in-memory data and closes IndexedDB connection.
   */
  destroy(): void {
    this._manifestCache = {};
    this.db?.close();
    this.db = null;
  }
}
