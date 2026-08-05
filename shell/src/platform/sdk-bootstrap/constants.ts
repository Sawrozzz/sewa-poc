/**
 * Constants shared by the host-side Mini App SDK bootstrap.
 *
 * The two global keys mirror the SDK's own constants (`SDK_GLOBAL_KEY` /
 * `HOST_DESCRIPTOR_GLOBAL_KEY`). They live here as the host's single source
 * of truth so no other host code hardcodes the strings. If the SDK renames a
 * key, update this module (and bump the pinned version).
 */

/** Mirrors `@lizuz/sewa-sdk`'s `SDK_GLOBAL_KEY`. */
export const SDK_GLOBAL_KEY = "__GSA_SDK__";
/** Mirrors `@lizuz/sewa-sdk`'s `HOST_DESCRIPTOR_GLOBAL_KEY`. */
export const HOST_DESCRIPTOR_GLOBAL_KEY = "__GSA_HOST_DESCRIPTOR__";

/**
 * Bundle sources tried in order; the first one that yields a live instance
 * wins. Self-hosted first: the published `@lizuz/sewa-sdk@1.0.2` on jsdelivr
 * is a stale pre-refactor build, so the pinned local bundle is preferred.
 */
export const DEFAULT_SDK_SOURCES = [
  "/sdk/sewa-sdk.min.js",
  "https://cdn.jsdelivr.net/npm/@lizuz/sewa-sdk@1.0.2/dist/sewa-sdk.min.js",
];

/** Capability strings the host advertises to mini apps via the host descriptor. */
export const DEFAULT_HOST_CAPABILITIES = [
  "auth",
  "permissions",
  "flags",
  "config",
  "navigation",
  "platform",
  "device",
  "storage",
  "api",
  "http",
  "appearance",
  "event",
  "ai",
  "sdk",
] as const;
