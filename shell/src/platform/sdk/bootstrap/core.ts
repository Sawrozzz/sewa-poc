import {
  SDK_GLOBAL_KEY,
  HOST_DESCRIPTOR_GLOBAL_KEY,
  DEFAULT_SDK_SOURCE,
  DEFAULT_SDK_VERSION,
  DEFAULT_HOST_CAPABILITIES,
} from './constants';

import type {
  MiniAppSdkHostOptions,
  MiniAppSdkLoadResult,
  SdkBootstrapEnv,
} from '@/types/platform';
import type { MiniAppSdkInterface } from '@lizuz/mini-app-types';

/**
 * Contract:
 *  - The host seeds `window.__GSA_SDK__` with a `MiniAppSdkOptions` object
 *    BEFORE the SDK `<script>` runs. The bundle reads it, constructs a single
 *    `MiniAppSdk`, and stores the live instance back on the same key.
 *  - `window.__GSA_HOST_DESCRIPTOR__` is read at construction time to expose
 *    the static host descriptor (type, version, capabilities, sdkVersion).
 *  - One instance per tab; `destroy()` removes it from the global again.
 */

export function readSdkInstance(w: Window & typeof globalThis): MiniAppSdkInterface | null {
  const global = w as unknown as Record<string, unknown>;
  const sdk = global[SDK_GLOBAL_KEY];
  return sdk && typeof (sdk as { initialize?: unknown }).initialize === 'function'
    ? (sdk as MiniAppSdkInterface)
    : null;
}

export function seedSdkConfig(
  w: Window & typeof globalThis,
  miniAppId: string,
  options: MiniAppSdkHostOptions,
): void {
  const global = w as unknown as Record<string, unknown>;
  global[SDK_GLOBAL_KEY] = {
    miniAppId,
    timeout: options.timeout ?? 30_000,
    retryAttempts: options.retryAttempts ?? 5,
    retryDelayMs: options.retryDelayMs ?? 500,
    maxRetryDelayMs: options.maxRetryDelayMs ?? 10_000,
    targetOrigin: w.location?.origin ?? '*',
  };
  global[HOST_DESCRIPTOR_GLOBAL_KEY] = {
    type: 'web' as const,
    version: options.hostVersion ?? '1.0.0',
    capabilities: [...(options.capabilities ?? DEFAULT_HOST_CAPABILITIES)],
    // Was a hardcoded "1.0.2" while the bundle being loaded was 1.0.4 — the
    // descriptor now tracks whatever version is actually configured.
    sdkVersion: options.sdkVersion ?? DEFAULT_SDK_VERSION,
  };
}

async function initializeSdk(sdk: MiniAppSdkInterface, now: () => number): Promise<number> {
  const started = now();
  await sdk.initialize();
  return Math.round(now() - started);
}

/**
 * Ensures a live, initialized SDK instance exists for `miniAppId`. Reuses an
 * existing instance if present; otherwise seeds the globals and loads the
 * configured bundle source. `initialize()` is idempotent, so waiting on it
 * guarantees the handshake completed before returning.
 *
 * Throws if the source fails to load, throws during evaluation, or loads
 * without producing an instance.
 */
export async function bootstrapMiniAppSdk(
  miniAppId: string,
  options: MiniAppSdkHostOptions,
  env: SdkBootstrapEnv,
): Promise<MiniAppSdkLoadResult> {
  const existing = readSdkInstance(env.window);
  if (existing) {
    return {
      sdk: existing,
      source: 'existing',
      initTimeMs: await initializeSdk(existing, env.now),
    };
  }

  const source = options.source ?? DEFAULT_SDK_SOURCE;
  seedSdkConfig(env.window, miniAppId, options);
  await env.loadScript(source);
  const sdk = readSdkInstance(env.window);
  if (!sdk) {
    throw new Error(`Mini App SDK did not initialize from ${source}`);
  }
  return { sdk, source, initTimeMs: await initializeSdk(sdk, env.now) };
}

/** Tears down the instance on a given window. */
export function destroySdkInstance(w: Window & typeof globalThis): void {
  const sdk = readSdkInstance(w);
  if (sdk) sdk.destroy();
}
