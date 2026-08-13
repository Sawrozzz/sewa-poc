/**
 * Runtime Loader - Unified export for all public APIs.
 *
 * Provides framework-agnostic loading of mini-app bundles with IndexedDB caching
 * and Shadow DOM isolation (default). Mini-apps built with React, Vue, Angular,
 * or any other framework can be loaded through the same interface.
 *
 * @example
 * ```typescript
 * import { createRuntimeLoader } from '@sewa/runtime-loader';
 *
 * const loader = createRuntimeLoader({
 *   maxModules: 5,
 *   onLoadComplete: (result) => console.log('Loaded:', result.moduleId),
 * });
 *
 * // Mini-apps mount inside a Shadow DOM by default, scoping their styles
 * // away from the host page — no mount mode option required.
 * const result = await loader.load(
 *   'my-mini-app',
 *   'https://cdn.example.com/mini-app/',
 *   '1.0.0'
 * );
 *
 * if (result.success) {
 *   result.bundle.mount(container, { services, config });
 * }
 * ```
 */

/** Helpers for republishing unpacked bundle assets as blob URLs */
export {
  isTextAsset,
  mimeTypeFor,
  rewriteAssetReferences,
  splitBundleEntries,
} from "./bundle-assets";
/** IndexedDB-backed cache for persistent storage of mini-app bundles */
export { PluginCacheDB } from "./cache";
/** Verify a downloaded archive against the manifest's bundleHash */
export { verifyBundleHash } from "./integrity";
/** Core runtime loader that orchestrates the loading lifecycle */
export { createRuntimeLoader, RuntimeLoader } from "./loader";
export type {
  BundleContents,
  BundleLoadOptions,
  BundleSpec,
  CachedBinaryFile,
  CachedFile,
  CacheOrder,
  LoadedModule,
  MiniAppBundle,
  MiniAppModuleExports,
  MiniAppRuntime,
  ModuleSourceKind,
  RuntimeLoaderOptions,
  ViteManifest,
  ViteManifestEntry,
} from "./types";
/** Universal mount function that works with any framework */
/** Mount inside a Shadow DOM root with scoped styles */
/** Universal unmount function that safely cleans up mini-apps */
/** Create a promise that resolves after a specified delay */
/** Extract file name from a URL path */
/** Normalize a base URL by removing trailing slash */
export {
  delay,
  getFileName,
  mountModule,
  mountWithIsolation,
  normalizeBaseUrl,
  unmountModule,
} from "./utils";
export type { ZipEntry } from "./zip";
/** Minimal in-browser ZIP reader for mini-app bundles */
export { unzip } from "./zip";
