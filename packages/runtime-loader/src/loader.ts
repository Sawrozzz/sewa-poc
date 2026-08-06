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
 * and optional Shadow DOM isolation.
 */

import { PluginCacheDB } from "./cache";
import { delay, mountWithIsolation } from "./utils";

import type {
  MiniAppBundle,
  LoadedModule,
  RuntimeLoaderOptions,
  ViteManifest,
  MountMode,
  MiniAppModuleExports,
  MiniAppRuntime,
  ManifestEntry,
} from "./types";
import type {
  RemoteLoadResult,
  PluginLoadOptions,
} from "@sewa/host-platform";

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

  /** Map of blob URLs for cleanup */
  private blobURLs = new Map<string, string>();

  /** Set of module IDs with injected CSS (prevents duplicates) */
  private injectedCSS = new Set<string>();

  /** Whether signature validation is required */
  private signatureRequired: boolean;

  /**
   * Create a full URL by combining base URL and file name.
   * @param baseUrl - Base directory URL
   * @param fileName - File name to append
   * @returns Complete URL
   */
  private async getFullUrl(baseUrl: string, fileName: string): Promise<string> {
    const baseUrlNoSlash = baseUrl.endsWith("/")
      ? baseUrl.slice(0, -1)
      : baseUrl;
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
   * @param mountMode - How to mount: 'dom' (default) or 'shadow' (isolated)
   * @returns Result of the load operation
   *
   * @example
   * ```typescript
   * const result = await loader.load(
   *   'my-mini-app',
   *   'https://cdn.example.com/mini-app/',
   *   '1.0.0',
   *   { retryAttempts: 3 },
   *   'shadow'  // Enable Shadow DOM isolation
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
    mountMode: MountMode = "dom",
  ): Promise<RemoteLoadResult> {
    // Return cached module if already loaded (and version still matches)
    const cached = this.loadedModules.get(moduleId);
    if (cached && cached.bundle && (!version || cached.version === version)) {
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
    const promise = this.loadInternal(
      moduleId,
      bundleUrl,
      version,
      options,
      mountMode,
    );
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
   * Revokes blob URLs, removes injected CSS, and clears from loaded modules.
   *
   * @param moduleId - ID of the module to unload
   */
  async unload(moduleId: string): Promise<void> {
    // Revoke blob URL
    const blobUrl = this.blobURLs.get(moduleId);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.blobURLs.delete(moduleId);
    }

    // Remove injected CSS
    if (typeof document !== "undefined") {
      const cssEl = document.querySelector(
        `style[data-plugin-css="${moduleId}"]`,
      );
      if (cssEl) cssEl.remove();
    }
    this.injectedCSS.delete(moduleId);

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
   * Inject CSS into the document head.
   * Prevents duplicate injection for the same module.
   *
   * @param css - CSS content to inject
   * @param moduleId - Module ID for tracking
   */
  private injectCSS(css: string, moduleId: string): void {
    if (typeof document === "undefined" || this.injectedCSS.has(moduleId))
      return;
    this.injectedCSS.add(moduleId);
    const style = document.createElement("style");
    style.setAttribute("data-plugin-css", moduleId);
    style.textContent = css;
    document.head.appendChild(style);
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
    const baseUrlNoSlash = baseUrl.endsWith("/")
      ? baseUrl.slice(0, -1)
      : baseUrl;
    const manifestUrl = `${baseUrlNoSlash}/manifest.json`;
    console.log("[RuntimeLoader] fetchViteManifest — URL:", manifestUrl);
    try {
      const res = await this.fetcher(manifestUrl, {
        cache: "no-store",
      });
      console.log(
        "[RuntimeLoader] fetchViteManifest response status:",
        res.status,
        "ok:",
        res.ok,
      );
      if (!res.ok) return null;
      const raw = (await res.json()) as Record<string, unknown>;
      console.log(
        "[RuntimeLoader] fetchViteManifest parsed JSON keys:",
        Object.keys(raw),
      );
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
   * @param mountMode - How to mount the module
   * @returns Result of the load operation
   */
  private async loadInternal(
    moduleId: string,
    bundleUrl: string,
    version: string | undefined,
    options: PluginLoadOptions,
    mountMode: MountMode,
  ): Promise<RemoteLoadResult> {
    const startTime = Date.now();
    this.onLoadStart?.(moduleId);
    const retryAttempts = options.retryAttempts ?? 3;
    const retryDelayMs = options.retryDelayMs ?? 1000;
    let lastError = "";

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        const result = await this.loadPlugin(
          moduleId,
          bundleUrl,
          version,
          startTime,
          options,
          mountMode,
        );
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
   * @param mountMode - How to mount the module
   * @returns Result of the load operation
   */
  private async loadPlugin(
    moduleId: string,
    bundleUrl: string,
    version: string | undefined,
    startTime: number,
    _options: PluginLoadOptions,
    mountMode: MountMode,
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
        throw new Error(
          `Cached directory exists but ${entryFileName} was not found`,
        );
      }
      files[entryFileName] = indexJs;

      // Load and inject cached CSS files
      for (const cssFile of cssFileNames) {
        const cssContent = await this.db.getFile(moduleId, cssFile);
        if (cssContent) {
          files[cssFile] = cssContent;
          this.injectCSS(cssContent, moduleId);
        }
      }
    } else {
      // 2. Download from network
      const manifestResult = await this.fetchViteManifest(bundleDirUrl);

      if (manifestResult) {
        const { manifest, signature } = manifestResult; // manifest is typed as ManifestEntry

        if (this.signatureRequired && !signature) {
          throw new Error(
            `Signature verification failed for module ${moduleId}`,
          );
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
            manifestBundle.files?.forEach((file) => manifestFileNames.add(file));
          }
        }

        // Always fetch entry file and styles
        if (entryFileName) manifestFileNames.add(entryFileName);
        cssFileNames.forEach((css) => manifestFileNames.add(css));

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
        cssFileNames.forEach((css) => fileNames.add(css));

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

    // 4. Inject CSS files (if downloading path didn't inject them yet)
    for (const cssFile of cssFileNames) {
      const cssContent = files[cssFile];
      if (cssContent) {
        this.injectCSS(cssContent, moduleId);
      }
    }

    // 5. Evaluate the JavaScript module
    const moduleExports = await this.evaluateModule(
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
        // Use mountWithIsolation to support Shadow DOM
        mountWithIsolation(typedExports, container, mountMode, props);
      },
      unmount: (container: HTMLElement) => {
        if (typeof typedExports.unmount === "function") {
          typedExports.unmount(container);
        }
      },
    };

    // Cache the loaded module
    this.loadedModules.set(moduleId, {
      moduleId,
      strategy: "plugin",
      bundle: miniAppBundle,
      version,
      loadedAt: Date.now(),
      mountMode,
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
   * Evaluate JavaScript code via Blob URL.
   *
   * Creates a Blob with process shim and the code, then uses dynamic import.
   * This allows evaluation of ESM modules in a sandboxed context.
   *
   * @param fileUrl - Original file URL (for blob URL mapping)
   * @param code - JavaScript code to evaluate
   * @returns Module exports as MiniAppModuleExports
   */
  private async evaluateModule(
    fileUrl: string,
    code: string,
  ): Promise<MiniAppModuleExports> {
    // Add process shim for Node.js compatibility
    const processShim = `self.process = self.process || { env: { NODE_ENV: "production" } };`;
    const blob = new Blob([processShim + code], {
      type: "application/javascript",
    });
    const blobUrl = URL.createObjectURL(blob);
    this.blobURLs.set(fileUrl, blobUrl);

    try {
      const mod = (await import(
        /* @vite-ignore */ /* webpackIgnore: true */ blobUrl
      )) as MiniAppModuleExports;
      return mod;
    } finally {
      URL.revokeObjectURL(blobUrl);
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
export function createRuntimeLoader(
  options: RuntimeLoaderOptions,
): RuntimeLoader {
  return new RuntimeLoader(options);
}
