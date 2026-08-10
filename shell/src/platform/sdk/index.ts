/**
 * Mini App SDK feature folder.
 *
 * Two concerns, one dependency direction (bootstrap → cache):
 *
 *  - `./cache` — versioned, verified, IndexedDB-backed delivery of the SDK
 *    bundle. Owns SDK identity, digest pins, the kill switch and the script
 *    injection logic shared by both paths.
 *  - `./bootstrap` — the host-side handshake: seeds `window.__GSA_SDK__` +
 *    the host descriptor before the bundle runs, then loads it (via `./cache`).
 *
 * `@/platform/sdk-cache` and `@/platform/sdk-bootstrap` still resolve to their
 * own shims that re-export from here, so nothing outside this folder changed.
 */

export {
  DEFAULT_SDK_SOURCE,
  DEFAULT_SDK_VERSION,
  SDK_CACHE_SWITCH_KEY,
  SDK_NAME,
  SDK_VERSION,
  bundleKey,
  isSdkCacheEnabled,
  resolveSdkSpec,
} from './cache';
export type { SdkSpecOverrides } from './cache';

export { loadSdkScript, purgeSdkCache, scheduleSdkWarm, warmSdkCache } from './cache';
export { injectScript, injectBlobScript } from './cache';
export { SdkIntegrityError, digest, verify } from '@/utils/sdk-utils';
export { loadSdkBundle, purgeSdkBundles, warmSdkBundle } from './cache';
export { IdbSdkStore } from './cache';
export type {
  CachedSdkBundle,
  SdkCacheEnv,
  SdkCacheOutcome,
  SdkCacheResult,
  SdkPinReason,
  SdkPointer,
  SdkSpec,
  SdkStore,
} from '@/types/platform';

export { SDK_GLOBAL_KEY, HOST_DESCRIPTOR_GLOBAL_KEY, DEFAULT_HOST_CAPABILITIES } from './bootstrap';
export {
  readSdkInstance,
  seedSdkConfig,
  bootstrapMiniAppSdk,
  destroySdkInstance,
} from './bootstrap';
export { loadMiniAppSdk, destroyMiniAppSdk } from './bootstrap';
