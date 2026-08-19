/**
 * Constants shared by the host-side Mini App SDK bootstrap.
 *
 * The global keys and capability list are already exported by
 * `@sewa/host-platform` (which mirrors `@lizuz/mini-app-types`), so they are
 * imported rather than re-declared — one source of truth.
 */

import { HOST_DESCRIPTOR_GLOBAL_KEY, SDK_CAPABILITIES, SDK_GLOBAL_KEY } from "@sewa/host-platform";
// Relative, not `@/platform/…`: this module is loaded by `node --test`, which
// does not resolve the TypeScript path alias.
import { DEFAULT_SDK_SOURCE, DEFAULT_SDK_VERSION } from "@/platform/sdk";

/**
 * SDK identity lives in `sdk/cache/config.ts`, which resolves it from
 * `NEXT_PUBLIC_SDK_*` and holds the build-time digest pins. Re-exported here
 * so the bootstrap's public surface is unchanged, and so the dependency runs
 * in exactly one direction: bootstrap → cache.
 *
 * `shell/public/sdk/sewa-sdk.min.js` is the self-hosted copy: both the
 * emergency source if jsDelivr ever has to be cut out, and the drop point for
 * an unpublished build under test. Flip `NEXT_PUBLIC_SDK_LOCAL=on` (or
 * `localStorage['sewa.sdk.local'] = 'on'`) to load it — it is not kept in sync
 * with the pinned CDN build, which is why that path is unpinned and uncached.
 */
export {
  DEFAULT_SDK_SOURCE,
  DEFAULT_SDK_VERSION,
  HOST_DESCRIPTOR_GLOBAL_KEY,
  SDK_CAPABILITIES,
  SDK_GLOBAL_KEY,
};

/** Capabilities the host advertises: the SDK's built-in set plus `event`. */
export const DEFAULT_HOST_CAPABILITIES = [...SDK_CAPABILITIES, "event"] as const;
