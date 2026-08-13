/**
 * Core Runtime Loader for mini-app bundles.
 *
 * Orchestrates the loading lifecycle:
 * 1. Check IndexedDB cache for existing bundle
 * 2. If miss, fetch Vite manifest and download files
 * 3. Store files in IndexedDB cache
 * 4. Evaluate JavaScript via Blob URL
 * 5. Mount using framework-agnostic mountModule()
 *
 * Supports retry logic, CSS injection, concurrent load handling,
 * and Shadow DOM isolation (default) for style scoping.
 */

import type { PluginLoadOptions, RemoteLoadResult } from "@sewa/host-platform";
import { mimeTypeFor, rewriteAssetReferences, splitBundleEntries } from "./bundle-assets";
import { PluginCacheDB } from "./cache";
import { verifyBundleHash } from "./integrity";
import type {
  BundleLoadOptions,
  LoadedModule,
  ManifestEntry,
  MiniAppBundle,
  MiniAppModuleExports,
  MiniAppRuntime,
  RuntimeLoaderOptions,
  ViteManifest,
} from "./types";
import { delay, mountWithIsolation } from "./utils";
import { unzip } from "./zip";

/**
 * Cache-key suffix for bundles loaded from a signed-manifest `.zip`.
 *
 * Keeps their IndexedDB entries separate from a legacy directory-loaded
 * mini-app that happens to carry the same id, so the two flows never evict or
 * read each other's files.
 */
const BUNDLE_CACHE_SUFFIX = "@bundle";

/** File name the archive's own build manifest is published under */
const BUNDLE_MANIFEST_FILE = "manifest.json";

/** Key the downloaded archive is parked under while it is verified */
const ARCHIVE_CACHE_KEY = "__bundle.zip__";

export class RuntimeLoader {
  /** Map of loaded modules by ID */
  private loadedModules = new Map<string, LoadedModule>();

  /** Map of in-progress loading promises (prevents concurrent loads) */
  private loadingPromises = new Map<string, Promise<RemoteLoadResult>>();

  /** Callbacks for load lifecycle events */
  private onLoadStart?: (moduleId: string) => void;
  private onLoadComplete?: (result: RemoteLoadResult) => void;
  private onLoadError?: (moduleId: string, error: string) => void;

  /** Fetch function for HTTP requests */
  fetcher: typeof fetch;

  /** IndexedDB cache for persistent storage */
  private db: PluginCacheDB;
  /** Map of module IDs to their blob URLs (revoked on unload) */
  private blobURLs = new Map<string, string>();

  /** Map of module IDs to blob URLs published for their bundle assets */
  private assetURLs = new Map<string, string[]>();

  /** Whether signature validation is required */
  private signatureRequired: boolean;

  /**
   * Create a full URL by combining base URL and file name.
   * @param baseUrl - Base directory URL
   * @param fileName - File name to append
   * @returns Complete URL
   */
  private async getFullUrl(baseUrl: string, fileName: string): Promise<string> {
    const baseUrlNoSlash = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return `${baseUrlNoSlash}/${fileName}`;
  }

  /**
   * Create a new RuntimeLoader instance.
   * @param options - Configuration options
   */
  constructor(options: RuntimeLoaderOptions) {
    this.onLoadStart = options.onLoadStart;
    this.onLoadComplete = options.onLoadComplete;
    this.onLoadError = options.onLoadError;
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.db = options.db ?? new PluginCacheDB(this.fetcher, options.maxModules);
    this.signatureRequired = options.signatureRequired ?? false;
  }

  /**
   * Load a mini-app module by ID and bundle URL.
   *
   * Returns cached version if available, otherwise downloads and caches.
   * Handles concurrent load requests by returning the same promise.
   *
   * @param moduleId - Unique identifier for the module
   * @param bundleUrl - URL where bundle files are located
   * @param version - Optional version for cache invalidation
   * @param options - Plugin load options (retry config, etc.)
   * @returns Result of the load operation
   *
   * Mini-apps are always mounted inside a Shadow DOM root, scoping their
   * styles away from the host page — no mount mode option required.
   *
   * @example
   * ```typescript
   * const result = await loader.load(
   *   'my-mini-app',
   *   'https://cdn.example.com/mini-app/',
   *   '1.0.0',
   *   { retryAttempts: 3 }
   * );
   *
   * if (result.success) {
   *   result.bundle.mount(container, { services, config });
   * }
   * ```
   */
  async load(
    moduleId: string,
    bundleUrl: string,
    version?: string,
    options: PluginLoadOptions = {},
  ): Promise<RemoteLoadResult> {
    // Return cached module if already loaded (and version still matches).
    // A module left behind by the bundle flow is never reused here — the two
    // flows resolve their files differently even for the same id.
    const cached = this.loadedModules.get(moduleId);
    if (cached?.kind !== "bundle" && cached?.bundle && (!version || cached.version === version)) {
      return {
        moduleId,
        success: true,
        loadTimeMs: 0,
        strategy: "plugin",
        bundle: cached.bundle,
        version: cached.version,
      };
    }

    // Return existing load promise if currently loading (prevents duplicates).
    // Keyed by version so a newer release never reuses an in-flight old load.
    const loadKey = `${moduleId}@${version ?? ""}`;
    const existing = this.loadingPromises.get(loadKey);
    if (existing) {
      return existing;
    }

    // Start new load operation
    const promise = this.loadInternal(moduleId, bundleUrl, version, options);
    this.loadingPromises.set(loadKey, promise);
    try {
      return await promise;
    } finally {
      this.loadingPromises.delete(loadKey);
    }
  }

  /**
   * Load a mini-app published as a signed-manifest `.zip` bundle.
   *
   * The archive is downloaded, parked in IndexedDB, hashed, and only unpacked
   * once its digest matches the manifest's `bundleHash`. The archive is then
   * dropped and its extracted files (JS, CSS, assets) take its place in the
   * cache. On the next open, a cached digest equal to the manifest's short-
   * circuits the whole cycle and the files are read straight from IndexedDB.
   *
   * `load()` and its directory-based flow are untouched — the two coexist.
   *
   * @param moduleId - Unique identifier for the module
   * @param bundleUrl - URL of the `.zip` archive
   * @param options - Bundle hash (required), version, and retry config
   * @returns Result of the load operation
   *
   * @example
   * ```typescript
   * const result = await loader.loadBundle('test-mini-app', app.bundleUrl, {
   *   bundleHash: app.bundleHash,
   *   version: app.version,
   *   retryAttempts: 2,
   * });
   * ```
   */
  async loadBundle(
    moduleId: string,
    bundleUrl: string,
    options: BundleLoadOptions,
  ): Promise<RemoteLoadResult> {
    // Reuse the evaluated module while it still matches the manifest's digest
    console.log(moduleId, bundleUrl, options)
    const cached = this.loadedModules.get(moduleId);
    if (cached?.kind === "bundle" && cached.bundleHash === options.bundleHash) {
      return {
        moduleId,
        success: true,
        loadTimeMs: 0,
        strategy: "plugin",
        bundle: cached.bundle,
        version: cached.version,
      };
    }

    // Collapse concurrent opens of the same release onto one download
    const loadKey = `${moduleId}${BUNDLE_CACHE_SUFFIX}@${options.bundleHash}`;
    const existing = this.loadingPromises.get(loadKey);
    if (existing) return existing;

    const promise = this.loadBundleInternal(moduleId, bundleUrl, options);
    this.loadingPromises.set(loadKey, promise);
    try {
      return await promise;
    } finally {
      this.loadingPromises.delete(loadKey);
    }
  }

  /**
   * Unload a module and clean up resources.
   *
   * Revokes the module's blob URL (freeing the evaluated bundle) and clears it
   * from the loaded modules. Styles scoped inside the mini-app's shadow root
   * are removed when the host unmounts the bundle.
   *
   * @param moduleId - ID of the module to unload
   */
  async unload(moduleId: string): Promise<void> {
    // Revoke the blob URL so the evaluated module's memory can be reclaimed
    const blobUrl = this.blobURLs.get(moduleId);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobURLs.delete(moduleId);
    }

    // Release blob URLs published for the bundle's assets
    for (const assetUrl of this.assetURLs.get(moduleId) ?? []) {
      URL.revokeObjectURL(assetUrl);
    }
    this.assetURLs.delete(moduleId);

    // Remove from loaded modules
    this.loadedModules.delete(moduleId);
  }

  /**
   * Get a loaded module by ID.
   * @param moduleId - Module ID to retrieve
   * @returns The loaded module or undefined
   */
  getLoadedModule(moduleId: string): LoadedModule | undefined {
    return this.loadedModules.get(moduleId);
  }

  /**
   * Check if a module is currently loaded.
   * @param moduleId - Module ID to check
   * @returns True if the module is loaded
   */
  isLoaded(moduleId: string): boolean {
    return this.loadedModules.has(moduleId);
  }

  /**
   * Collect the mini-app's CSS file contents so they can be injected into the
   * mini-app's shadow root on mount, scoping the styles away from the host.
   *
   * @param files - Downloaded files, keyed by file name
   * @param cssFileNames - Names of the CSS files to apply
   * @returns CSS contents to inject into the shadow root
   */
  private collectStyles(files: Record<string, string>, cssFileNames: string[]): string[] {
    const styles: string[] = [];
    for (const cssFile of cssFileNames) {
      const cssContent = files[cssFile];
      if (cssContent) {
        styles.push(cssContent);
      }
    }
    return styles;
  }

  /**
   * Fetch Vite manifest.json from bundle directory.
   *
   * @param baseUrl - Base URL of the bundle directory
   * @returns Parsed manifest and signature status, or null if not found
   */
  private async fetchViteManifest(
    baseUrl: string,
  ): Promise<{ manifest: ViteManifest; signature: boolean } | null> {
    const baseUrlNoSlash = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const manifestUrl = `${baseUrlNoSlash}/manifest.json`;
    console.log("[RuntimeLoader] fetchViteManifest — URL:", manifestUrl);
    try {
      const res = await this.fetcher(manifestUrl, {
        cache: "no-store",
      });
      console.log("[RuntimeLoader] fetchViteManifest response status:", res.status, "ok:", res.ok);
      if (!res.ok) return null;
      const raw = (await res.json()) as Record<string, unknown>;
      console.log("[RuntimeLoader] fetchViteManifest parsed JSON keys:", Object.keys(raw));
      const signature = raw.signature === true;
      const { signature: _sig, ...entries } = raw;
      console.log(
        "[RuntimeLoader] fetchViteManifest returning — entries keys:",
        Object.keys(entries as ViteManifest),
        "signature:",
        signature,
      );
      return { manifest: entries as ViteManifest, signature };
    } catch (err) {
      console.error("[RuntimeLoader] fetchViteManifest FAILED:", err);
      return null;
    }
  }

  /**
   * Internal load implementation with retry logic.
   *
   * Attempts load up to retryAttempts times with exponential backoff.
   *
   * @param moduleId - Module ID to load
   * @param bundleUrl - URL of the bundle directory
   * @param version - Optional version string
   * @param options - Plugin load options
   * @returns Result of the load operation
   */
  private async loadInternal(
    moduleId: string,
    bundleUrl: string,
    version: string | undefined,
    options: PluginLoadOptions,
  ): Promise<RemoteLoadResult> {
    const startTime = Date.now();
    this.onLoadStart?.(moduleId);
    const retryAttempts = options.retryAttempts ?? 3;
    const retryDelayMs = options.retryDelayMs ?? 1000;
    let lastError = "";

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        const result = await this.loadPlugin(moduleId, bundleUrl, version, startTime, options);
        if (result.success) {
          this.onLoadComplete?.(result);
          return result;
        }
        lastError = result.error ?? "Unknown error";
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      if (attempt < retryAttempts) await delay(retryDelayMs * (attempt + 1));
    }

    const result: RemoteLoadResult = {
      moduleId,
      success: false,
      loadTimeMs: Date.now() - startTime,
      strategy: "plugin",
      error: lastError,
    };
    this.onLoadError?.(moduleId, lastError);
    return result;
  }

  /**
   * Core plugin loading logic.
   *
   * Handles the complete load lifecycle:
   * 1. Check IndexedDB cache
   * 2. If miss, fetch manifest and download files
   * 3. Evaluate JavaScript via Blob URL
   * 4. Create bundle with mount/unmount methods
   *
   * @param moduleId - Module ID to load
   * @param bundleUrl - URL of the bundle directory
   * @param version - Optional version string
   * @param startTime - Timestamp when load started (for timing)
   * @param _options - Plugin load options (unused)
   * @returns Result of the load operation
   */
  private async loadPlugin(
    moduleId: string,
    bundleUrl: string,
    version: string | undefined,
    startTime: number,
    _options: PluginLoadOptions,
  ): Promise<RemoteLoadResult> {
    if (!bundleUrl) throw new Error(`Module ${moduleId} missing bundleUrl`);
    const bundleDirUrl = bundleUrl;

    // Check if module is cached
    let dirCached = await this.db.hasDirectory(moduleId);

    // Version-aware invalidation: if the cached copy is an older version,
    // purge it so the new release is downloaded below.
    if (dirCached && version) {
      const cachedVersion = await this.db.getVersion(moduleId);
      if (cachedVersion !== version) {
        console.log(
          "[RuntimeLoader] Cache stale for",
          moduleId,
          "cached:",
          cachedVersion,
          "requested:",
          version,
          "— purging",
        );
        await this.db.deleteModule(moduleId);
        dirCached = false;
      }
    }

    let files: Record<string, string> = {};
    let entryFileName = "index.js";
    let cssFileNames: string[] = [];

    if (dirCached) {
      // Load from cache
      const cachedManifestStr = await this.db.getFile(moduleId, "manifest");

      if (cachedManifestStr) {
        const manifest: ManifestEntry = JSON.parse(cachedManifestStr);

        // Read directly from the bundle property
        entryFileName = manifest.bundle.entry || "index.js";
        cssFileNames = manifest.bundle.styles ?? [];
      }

      // Load entry JS file from storage
      const indexJs = await this.db.getFile(moduleId, entryFileName);
      if (!indexJs) {
        throw new Error(`Cached directory exists but ${entryFileName} was not found`);
      }
      files[entryFileName] = indexJs;

      // Load cached CSS files (injection is handled once all files are assembled)
      for (const cssFile of cssFileNames) {
        const cssContent = await this.db.getFile(moduleId, cssFile);
        if (cssContent) {
          files[cssFile] = cssContent;
        }
      }
    } else {
      // 2. Download from network
      const manifestResult = await this.fetchViteManifest(bundleDirUrl);

      if (manifestResult) {
        const { manifest, signature } = manifestResult; // manifest is typed as ManifestEntry

        if (this.signatureRequired && !signature) {
          throw new Error(`Signature verification failed for module ${moduleId}`);
        }

        // Determine all files that need downloading (or pass manifest.bundle.files)
        const manifestFileNames = new Set<string>();

        if (manifest) {
          const manifestBundle = (
            manifest as {
              bundle?: {
                entry?: string;
                styles?: string[];
                files?: string[];
              };
            }
          ).bundle;

          if (manifestBundle) {
            entryFileName = manifestBundle.entry ?? entryFileName;
            cssFileNames = manifestBundle.styles ?? [];
            manifestBundle.files?.forEach((file) => {
              manifestFileNames.add(file);
            });
          }
        }

        // Always fetch entry file and styles
        if (entryFileName) manifestFileNames.add(entryFileName);
        cssFileNames.forEach((css) => {
          manifestFileNames.add(css);
        });

        files = await this.db.downloadDirectory(
          bundleDirUrl,
          moduleId,
          _options,
          Array.from(manifestFileNames),
          manifest,
        );
      } else {
        // Fallback if manifest download fails
        const fileNames = new Set<string>();
        fileNames.add(entryFileName);
        cssFileNames.forEach((css) => {
          fileNames.add(css);
        });

        files = await this.db.downloadDirectory(
          bundleDirUrl,
          moduleId,
          _options,
          Array.from(fileNames),
          null,
        );
      }

      // Persist the version marker alongside the freshly downloaded files
      if (version) {
        await this.db.setVersion(moduleId, version);
      }
    }

    // 3. Get the entry JavaScript file
    const indexJs = files[entryFileName];
    if (!indexJs) {
      throw new Error(
        `Could not find ${entryFileName}. Available: ${Object.keys(files).join(", ")}`,
      );
    }

    // 4. Collect the CSS contents to scope inside the mini-app's shadow root
    const styles = this.collectStyles(files, cssFileNames);

    // 5. Evaluate the JavaScript module
    const moduleExports = await this.evaluateModule(
      moduleId,
      await this.getFullUrl(bundleDirUrl, entryFileName),
      indexJs,
    );

    // Validate module exports
    if (typeof moduleExports.mount !== "function")
      throw new Error(`Bundle ${entryFileName} must export a mount() function`);

    // Create bundle with mount/unmount methods
    const typedExports = moduleExports as MiniAppModuleExports;
    const miniAppBundle: MiniAppBundle = {
      mount: (container: HTMLElement, props?: MiniAppRuntime) => {
        // Always mount inside a Shadow DOM root for style isolation
        mountWithIsolation(typedExports, container, props, styles);
      },
      unmount: (container: HTMLElement) => {
        // The mini-app was mounted on an inner container inside the shadow
        // root, so unmount from there and clear the root afterwards.
        const shadow = container.shadowRoot;
        if (shadow) {
          const inner = shadow.querySelector("[data-mini-app-container]");
          if (inner && typeof typedExports.unmount === "function") {
            typedExports.unmount(inner as HTMLElement);
          }
          shadow.innerHTML = "";
        }
      },
      styles,
    };

    // Cache the loaded module
    this.loadedModules.set(moduleId, {
      moduleId,
      strategy: "plugin",
      bundle: miniAppBundle,
      version,
      loadedAt: Date.now(),
    });

    return {
      moduleId,
      success: true,
      loadTimeMs: Date.now() - startTime,
      strategy: "plugin",
      bundle: miniAppBundle,
      version,
    };
  }

  /**
   * Bundle load implementation with retry logic.
   *
   * Mirrors {@link loadInternal}: attempts the load up to retryAttempts times
   * with a linear backoff, reporting through the lifecycle callbacks.
   *
   * @param moduleId - Module ID to load
   * @param bundleUrl - URL of the `.zip` archive
   * @param options - Bundle hash, version, and retry config
   * @returns Result of the load operation
   */
  private async loadBundleInternal(
    moduleId: string,
    bundleUrl: string,
    options: BundleLoadOptions,
  ): Promise<RemoteLoadResult> {
    const startTime = Date.now();
    this.onLoadStart?.(moduleId);
    const retryAttempts = options.retryAttempts ?? 2;
    const retryDelayMs = options.retryDelayMs ?? 1000;
    let lastError = "";

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        const result = await this.loadBundlePlugin(moduleId, bundleUrl, options, startTime);
        if (result.success) {
          this.onLoadComplete?.(result);
          return result;
        }
        lastError = result.error ?? "Unknown error";
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      if (attempt < retryAttempts) await delay(retryDelayMs * (attempt + 1));
    }

    const result: RemoteLoadResult = {
      moduleId,
      success: false,
      loadTimeMs: Date.now() - startTime,
      strategy: "plugin",
      error: lastError,
    };
    this.onLoadError?.(moduleId, lastError);
    return result;
  }

  /**
   * Core bundle loading logic.
   *
   * 1. Reuse the cached extraction when its digest matches the manifest
   * 2. Otherwise download, verify, unpack, and cache the archive
   * 3. Assemble the entry JS, styles, and asset URLs from the cache
   * 4. Evaluate the entry and wrap it in a mountable bundle
   *
   * @param moduleId - Module ID to load
   * @param bundleUrl - URL of the `.zip` archive
   * @param options - Bundle hash, version, and retry config
   * @param startTime - Timestamp when the load started (for timing)
   * @returns Result of the load operation
   */
  private async loadBundlePlugin(
    moduleId: string,
    bundleUrl: string,
    options: BundleLoadOptions,
    startTime: number,
  ): Promise<RemoteLoadResult> {
    if (!bundleUrl) throw new Error(`Module ${moduleId} missing bundleUrl`);
    if (!options.bundleHash) throw new Error(`Module ${moduleId} missing bundleHash`);

    const cacheId = `${moduleId}${BUNDLE_CACHE_SUFFIX}`;
    const cachedHash = await this.db.getBundleHash(cacheId);

    if (cachedHash === options.bundleHash) {
      console.log("[RuntimeLoader] Bundle cache HIT —", moduleId, "hash:", cachedHash);
    } else {
      console.log(
        "[RuntimeLoader] Bundle cache MISS —",
        moduleId,
        "cached:",
        cachedHash,
        "manifest:",
        options.bundleHash,
      );
      await this.materializeBundle(cacheId, bundleUrl, options);
    }

    const { entryFileName, entryCode, styles } = await this.readBundleFromCache(cacheId, moduleId);

    const moduleExports = await this.evaluateModule(moduleId, entryFileName, entryCode);
    if (typeof moduleExports.mount !== "function") {
      throw new Error(`Bundle ${entryFileName} must export a mount() function`);
    }

    const typedExports = moduleExports as MiniAppModuleExports;
    const miniAppBundle: MiniAppBundle = {
      mount: (container: HTMLElement, props?: MiniAppRuntime) => {
        mountWithIsolation(typedExports, container, props, styles);
      },
      unmount: (container: HTMLElement) => {
        const shadow = container.shadowRoot;
        if (shadow) {
          const inner = shadow.querySelector("[data-mini-app-container]");
          if (inner && typeof typedExports.unmount === "function") {
            typedExports.unmount(inner as HTMLElement);
          }
          shadow.innerHTML = "";
        }
      },
      styles,
    };

    this.loadedModules.set(moduleId, {
      moduleId,
      strategy: "plugin",
      bundle: miniAppBundle,
      version: options.version,
      loadedAt: Date.now(),
      kind: "bundle",
      bundleHash: options.bundleHash,
    });

    return {
      moduleId,
      success: true,
      loadTimeMs: Date.now() - startTime,
      strategy: "plugin",
      bundle: miniAppBundle,
      version: options.version,
    };
  }

  /**
   * Download, verify, and unpack a mini-app archive into the cache.
   *
   * The archive is written to IndexedDB before it is touched, then read back
   * and hashed — so the bytes that get verified are the same bytes that were
   * stored. A digest mismatch discards the archive without unpacking it.
   *
   * @param cacheId - Cache-scoped module ID
   * @param bundleUrl - URL of the `.zip` archive
   * @param options - Bundle hash and version from the manifest
   * @throws When the download fails or the digest does not match
   */
  private async materializeBundle(
    cacheId: string,
    bundleUrl: string,
    options: BundleLoadOptions,
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60000);

    try {
      console.log("[RuntimeLoader] Downloading bundle:", bundleUrl);
      const res = await this.fetcher(bundleUrl, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Bundle download failed — ${res.status} ${res.statusText}`);
      }
      const downloaded = new Uint8Array(await res.arrayBuffer());

      // Park the archive in IndexedDB, then verify what was actually stored
      await this.db.putBinary(
        cacheId,
        ARCHIVE_CACHE_KEY,
        downloaded.slice().buffer as ArrayBuffer,
        "application/zip",
      );
      const stored = await this.db.getBinary(cacheId, ARCHIVE_CACHE_KEY);
      if (!stored) throw new Error("Bundle archive vanished from cache before verification");
      const archive = new Uint8Array(stored.bytes);

      const { matches, actual } = await verifyBundleHash(archive, options.bundleHash);
      if (!matches) {
        await this.db.deleteFile(cacheId, ARCHIVE_CACHE_KEY);
        throw new Error(
          `Bundle hash mismatch — expected ${options.bundleHash}, computed sha256-${actual}`,
        );
      }
      console.log("[RuntimeLoader] Bundle hash verified:", options.bundleHash);

      try {
        const entries = await unzip(archive);
        const contents = splitBundleEntries(entries);
        if (!contents.text[BUNDLE_MANIFEST_FILE]) {
          throw new Error(`Bundle archive is missing ${BUNDLE_MANIFEST_FILE}`);
        }
        await this.db.storeBundle(cacheId, contents, {
          bundleHash: options.bundleHash,
          version: options.version,
        });
      } finally {
        // The archive itself is never kept — only what came out of it, and it
        // goes even when extraction fails so a bad download can't linger.
        await this.db.deleteFile(cacheId, ARCHIVE_CACHE_KEY);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Assemble a bundle's entry code and styles from the cache.
   *
   * Assets other than the entry and its stylesheets are republished as blob
   * URLs and the references to them inside the code are rewritten, since an
   * unpacked archive has no origin to resolve relative paths against.
   *
   * @param cacheId - Cache-scoped module ID
   * @param moduleId - Module ID the blob URLs are tracked under
   * @returns Entry file name, rewritten entry code, and rewritten styles
   */
  private async readBundleFromCache(
    cacheId: string,
    moduleId: string,
  ): Promise<{ entryFileName: string; entryCode: string; styles: string[] }> {
    const manifestText = await this.db.getFile(cacheId, BUNDLE_MANIFEST_FILE);
    if (!manifestText) {
      throw new Error(`Cached bundle for ${moduleId} is missing ${BUNDLE_MANIFEST_FILE}`);
    }

    const manifest: ManifestEntry = JSON.parse(manifestText);
    const entryFileName = manifest.bundle?.entry || "index.js";
    const styleNames = manifest.bundle?.styles ?? [];
    const assetNames = (manifest.bundle?.files ?? []).filter(
      (file) => file !== entryFileName && !styleNames.includes(file),
    );

    // Release URLs from a previous load of this module before minting new ones
    for (const stale of this.assetURLs.get(moduleId) ?? []) URL.revokeObjectURL(stale);
    const published: string[] = [];
    const assetUrls: Record<string, string> = {};

    for (const asset of assetNames) {
      const text = await this.db.getFile(cacheId, asset);
      const blob =
        text !== null
          ? new Blob([text], { type: mimeTypeFor(asset) })
          : await this.db
              .getBinary(cacheId, asset)
              .then((bin) => (bin ? new Blob([bin.bytes], { type: bin.mimeType }) : null));
      if (!blob) {
        console.warn("[RuntimeLoader] Bundle asset missing from cache:", asset);
        continue;
      }
      const url = URL.createObjectURL(blob);
      assetUrls[asset] = url;
      published.push(url);
    }
    this.assetURLs.set(moduleId, published);

    const rawEntry = await this.db.getFile(cacheId, entryFileName);
    if (!rawEntry) {
      throw new Error(`Cached bundle for ${moduleId} is missing entry ${entryFileName}`);
    }

    const styles: string[] = [];
    for (const styleName of styleNames) {
      const css = await this.db.getFile(cacheId, styleName);
      if (css) styles.push(rewriteAssetReferences(css, assetUrls));
    }

    return {
      entryFileName,
      entryCode: rewriteAssetReferences(rawEntry, assetUrls),
      styles,
    };
  }

  /**
   * Evaluate JavaScript code via Blob URL.
   *
   * Creates a Blob with process shim and the code, then uses dynamic import.
   * This allows evaluation of ESM modules in a sandboxed context.
   *
   * The blob URL is kept alive while the module is loaded and revoked in
   * unload(), so the loader can reclaim the bundle when the mini-app is no
   * longer needed.
   *
   * @param moduleId - Module ID owning the blob URL (for cleanup on unload)
   * @param fileUrl - Original file URL (for tracking/logging)
   * @param code - JavaScript code to evaluate
   * @returns Module exports as MiniAppModuleExports
   */
  private async evaluateModule(
    moduleId: string,
    fileUrl: string,
    code: string,
  ): Promise<MiniAppModuleExports> {
    // Add process shim for Node.js compatibility
    const processShim = `self.process = self.process || { env: { NODE_ENV: "production" } };`;
    const blob = new Blob([processShim + code], {
      type: "application/javascript",
    });
    const blobUrl = URL.createObjectURL(blob);
    console.log("[RuntimeLoader] evaluateModule — moduleId:", moduleId, "file:", fileUrl);

    // Release any previous blob URL for this module before registering the
    // new one. The URL stays alive while the module is loaded and is revoked
    // on unload().
    const previous = this.blobURLs.get(moduleId);
    if (previous) URL.revokeObjectURL(previous);
    this.blobURLs.set(moduleId, blobUrl);

    try {
      return (await import(
        /* @vite-ignore */ /* webpackIgnore: true */ blobUrl
      )) as MiniAppModuleExports;
    } catch (err) {
      // Evaluation failed — release the blob URL immediately
      this.blobURLs.delete(moduleId);
      URL.revokeObjectURL(blobUrl);
      throw err;
    }
  }
}

/**
 * Factory function to create a RuntimeLoader instance.
 *
 * @param options - Configuration options for the loader
 * @returns New RuntimeLoader instance
 *
 * @example
 * ```typescript
 * const loader = createRuntimeLoader({
 *   maxModules: 5,
 *   signatureRequired: true,
 *   onLoadComplete: (result) => console.log('Loaded:', result.moduleId),
 * });
 * ```
 */
export function createRuntimeLoader(options: RuntimeLoaderOptions): RuntimeLoader {
  return new RuntimeLoader(options);
}
