/**
 * IndexedDB-backed delivery for the Mini App SDK bundle.
 *
 * Design notes, failure matrix and rollout phases live in `sdkCache.md` at the
 * repo root. The short version: the host owns which SDK version runs, the
 * bytes are hash-verified before they execute, and every failure path degrades
 * to the CDN `<script>` that shipped before this module existed.
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
} from './config';
export type { SdkSpecOverrides } from './config';

export { loadSdkScript, purgeSdkCache, scheduleSdkWarm, warmSdkCache } from './browser';

export { injectScript, injectBlobScript } from './execute';
export { SdkIntegrityError, digest, verify } from '@/utils/sdk-utils';
export { loadSdkBundle, purgeSdkBundles, warmSdkBundle } from './core';
export { IdbSdkStore } from './db';

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
