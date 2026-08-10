// Relative, not `@/platform/…`: this module is reached by `node --test`, which
// does not resolve the TypeScript path alias.
import { loadSdkScript } from '../cache/browser';
import { resolveSdkSpec } from '../cache/config';
import { injectScript } from '../cache/execute';

import { bootstrapMiniAppSdk, destroySdkInstance } from './core';

import type { MiniAppSdkHostOptions, MiniAppSdkLoadResult } from '@/types/platform';

/**
 * Browser adapters for the Mini App SDK bootstrap. These are the only pieces
 * that touch the DOM (`document` / `window` globals); the pure logic lives in
 * `core.ts` and is unit-tested without a browser.
 */

/**
 * Injects the SDK `<script>` and resolves when it has executed.
 *
 * Kept as the un-cached path: `sdk-cache` degrades to exactly this whenever
 * IndexedDB is unusable, so it stays the behaviour of last resort rather than
 * dead code. The uncaught-exception trap that tells a broken bundle from a
 * good one now lives in `sdk/cache/execute.ts`, since both paths need it.
 */
export function loadBrowserScript(source: string): Promise<void> {
  return injectScript({ src: source });
}

/**
 * Browser entry point: ensures a live, initialized SDK instance.
 *
 * The bundle is served from IndexedDB when possible — see `sdkCache.md`. The
 * whole change sits behind `SdkBootstrapEnv.loadScript`, so `core.ts` and its
 * tests are untouched.
 */
export function loadMiniAppSdk(
  miniAppId: string,
  options: MiniAppSdkHostOptions = {},
): Promise<MiniAppSdkLoadResult> {
  const spec = resolveSdkSpec({
    source: options.source,
    sdkVersion: options.sdkVersion,
  });

  return bootstrapMiniAppSdk(
    miniAppId,
    {
      ...options,
      source: spec.url,
      // Advertise the version actually being loaded, rather than a literal
      // that has to be kept in sync by hand.
      sdkVersion: options.sdkVersion ?? spec.version,
    },
    {
      window,
      loadScript: () => loadSdkScript(spec),
      now: () => performance.now(),
    },
  );
}

/** Tears down the live SDK instance (no-op when none is present). */
export function destroyMiniAppSdk(): void {
  destroySdkInstance(window);
}
