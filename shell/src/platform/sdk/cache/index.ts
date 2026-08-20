/**
 * IndexedDB-backed delivery for the Mini App SDK bundle.
 *
 * Design notes, failure matrix and rollout phases live in `sdkCache.md` at the
 * repo root. The short version: the host owns which SDK version runs, the
 * bytes are hash-verified before they execute, and every failure path degrades
 * to the CDN `<script>` that shipped before this module existed.
 */

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
export { digest, SdkIntegrityError, verify } from "@/utils/sdk-utils";
export { loadSdkScript, purgeSdkCache, scheduleSdkWarm, warmSdkCache } from "./browser";
export type { SdkSpecOverrides } from "./config";
export {
  bundleKey,
  DEFAULT_SDK_SOURCE,
  DEFAULT_SDK_VERSION,
  isLocalSdk,
  isSdkCacheEnabled,
  resolveSdkSpec,
  SDK_CACHE_SWITCH_KEY,
  SDK_LOCAL_SOURCE,
  SDK_LOCAL_SWITCH_KEY,
  SDK_NAME,
  SDK_VERSION,
} from "./config";
export { loadSdkBundle, purgeSdkBundles, warmSdkBundle } from "./core";
export { IdbSdkStore } from "./db";
export { injectBlobScript, injectScript } from "./execute";
