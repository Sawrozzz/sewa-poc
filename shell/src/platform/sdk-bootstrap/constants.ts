/**
 * Constants shared by the host-side Mini App SDK bootstrap.
 *
 * The global keys and capability list are already exported by
 * `@sewa/host-platform` (which mirrors `@lizuz/mini-app-types`), so they are
 * imported rather than re-declared — one source of truth.
 */

import { HOST_DESCRIPTOR_GLOBAL_KEY, SDK_CAPABILITIES, SDK_GLOBAL_KEY } from '@sewa/host-platform';

export { SDK_GLOBAL_KEY, HOST_DESCRIPTOR_GLOBAL_KEY, SDK_CAPABILITIES };

/**
 * Bundle sources tried in order; the first one that yields a live instance
 * wins. Self-hosted first: the published `@lizuz/sewa-sdk@1.0.2` on jsdelivr
 * is a stale pre-refactor build, so the pinned local bundle is preferred.
 */
// export const DEFAULT_SDK_SOURCE = '/sdk/sewa-sdk.min.js';

export const DEFAULT_SDK_SOURCE =
  'https://cdn.jsdelivr.net/npm/@lizuz/sewa-sdk@1.0.4/dist/sewa-sdk.min.js';

/** Capabilities the host advertises: the SDK's built-in set plus `event`. */
export const DEFAULT_HOST_CAPABILITIES = [...SDK_CAPABILITIES, 'event'] as const;
