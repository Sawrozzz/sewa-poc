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

export { digest, SdkIntegrityError, verify } from "@/shared/lib/sdk-utils";
export type {
  CachedSdkBundle,
  SdkCacheEnv,
  SdkCacheOutcome,
  SdkCacheResult,
  SdkPinReason,
  SdkPointer,
  SdkSpec,
  SdkStore,
} from "@/types/platform";
export {
  bootstrapMiniAppSdk,
  DEFAULT_HOST_CAPABILITIES,
  destroyMiniAppSdk,
  destroySdkInstance,
  HOST_DESCRIPTOR_GLOBAL_KEY,
  loadMiniAppSdk,
  readSdkInstance,
  SDK_GLOBAL_KEY,
  seedSdkConfig,
} from "./bootstrap";
export type { SdkSpecOverrides } from "./cache";
export {
  bundleKey,
  DEFAULT_SDK_SOURCE,
  DEFAULT_SDK_VERSION,
  IdbSdkStore,
  injectBlobScript,
  injectScript,
  isLocalSdk,
  isSdkCacheEnabled,
  loadSdkBundle,
  loadSdkScript,
  purgeSdkBundles,
  purgeSdkCache,
  resolveSdkSpec,
  SDK_CACHE_SWITCH_KEY,
  SDK_LOCAL_SOURCE,
  SDK_LOCAL_SWITCH_KEY,
  SDK_NAME,
  SDK_VERSION,
  scheduleSdkWarm,
  warmSdkBundle,
  warmSdkCache,
} from "./cache";
