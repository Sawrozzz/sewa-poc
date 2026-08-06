/**
 * Runtime Loader - Unified export for all public APIs.
 *
 * Provides framework-agnostic loading of mini-app bundles with IndexedDB caching
 * and optional Shadow DOM isolation. Mini-apps built with React, Vue, Angular,
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
 * // Load with regular DOM mounting
 * const result = await loader.load(
 *   'my-mini-app',
 *   'https://cdn.example.com/mini-app/',
 *   '1.0.0'
 * );
 *
 * // Or load with Shadow DOM isolation
 * const result = await loader.load(
 *   'my-mini-app',
 *   'https://cdn.example.com/mini-app/',
 *   '1.0.0',
 *   {},
 *   'shadow'
 * );
 *
 * if (result.success) {
 *   result.bundle.mount(container, { services, config });
 * }
 * ```
 */

export type {
  BundleSpec,
  RuntimeLoaderOptions,
  MiniAppBundle,
  MiniAppRuntime,
  MiniAppModuleExports,
  LoadedModule,
  ViteManifestEntry,
  ViteManifest,
  CachedFile,
  CacheOrder,
  MountMode,
} from './types';

/** Core runtime loader that orchestrates the loading lifecycle */
export { RuntimeLoader, createRuntimeLoader } from './loader';

/** IndexedDB-backed cache for persistent storage of mini-app bundles */
export { PluginCacheDB } from './cache';

/** Universal mount function that works with any framework */
export { mountModule } from './utils';

/** Mount with optional Shadow DOM isolation */
export { mountWithIsolation } from './utils';

/** Universal unmount function that safely cleans up mini-apps */
export { unmountModule } from './utils';

/** Create a promise that resolves after a specified delay */
export { delay } from './utils';

/** Extract file name from a URL path */
export { getFileName } from './utils';

/** Normalize a base URL by removing trailing slash */
export { normalizeBaseUrl } from './utils';
