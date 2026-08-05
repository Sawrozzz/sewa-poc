import type { MiniAppSdkInterface } from "@lizuz/mini-app-types";
import {
  SDK_GLOBAL_KEY,
  HOST_DESCRIPTOR_GLOBAL_KEY,
  DEFAULT_SDK_SOURCES,
  DEFAULT_HOST_CAPABILITIES,
} from "./constants.ts";
import type {
  MiniAppSdkHostOptions,
  MiniAppSdkLoadResult,
  SdkBootstrapEnv,
} from "./types.ts";

/**
 * Environment-injected, DOM-free core of the host-side Mini App SDK bootstrap
 * (`@lizuz/sewa-sdk` v1.x).
 *
 * Contract (documented in the SDK's README and `src/cdn.ts`):
 *  - The host seeds `window.__GSA_SDK__` with a `MiniAppSdkOptions` object
 *    BEFORE the SDK `<script>` runs. The bundle reads it, constructs a single
 *    `MiniAppSdk`, and stores the live instance back on the same key.
 *  - `window.__GSA_HOST_DESCRIPTOR__` is read at construction time to expose
 *    the static host descriptor (type, version, capabilities, sdkVersion).
 *  - One instance per tab; `destroy()` removes it from the global again.
 */

/** The live SDK instance on `__GSA_SDK__`, or null when absent/not an instance. */
export function readSdkInstance(
  w: Window & typeof globalThis,
): MiniAppSdkInterface | null {
  const global = w as unknown as Record<string, unknown>;
  const sdk = global[SDK_GLOBAL_KEY];
  return sdk && typeof (sdk as { initialize?: unknown }).initialize === "function"
    ? (sdk as MiniAppSdkInterface)
    : null;
}

/** Writes the `MiniAppSdkOptions` + host descriptor globals before a bundle loads. */
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
    // Pinned to the shell's own origin: mini apps run in this same window, so
    // the SDK's `window.parent.postMessage` round-trips to itself — exact-
    // origin delivery works, and inbound messages from other origins drop.
    targetOrigin: w.location?.origin ?? "*",
  };
  global[HOST_DESCRIPTOR_GLOBAL_KEY] = {
    type: "web" as const,
    version: options.hostVersion ?? "1.0.0",
    capabilities: [...(options.capabilities ?? DEFAULT_HOST_CAPABILITIES)],
    sdkVersion: options.sdkVersion ?? "1.0.2",
  };
}

async function initializeSdk(
  sdk: MiniAppSdkInterface,
  now: () => number,
): Promise<number> {
  const started = now();
  await sdk.initialize();
  return Math.round(now() - started);
}

/**
 * Ensures a live, initialized SDK instance exists for `miniAppId`. Reuses an
 * existing instance if present; otherwise seeds the globals and tries each
 * bundle source until one yields an instance. `initialize()` is idempotent,
 * so waiting on it guarantees the handshake completed before returning.
 *
 * Throws if every source fails to load, throws during evaluation, or loads
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
      source: "existing",
      initTimeMs: await initializeSdk(existing, env.now),
    };
  }

  const sources = options.sources?.length
    ? [...options.sources]
    : [...DEFAULT_SDK_SOURCES];
  const failures: string[] = [];

  for (const source of sources) {
    seedSdkConfig(env.window, miniAppId, options);
    try {
      await env.loadScript(source);
    } catch (err) {
      failures.push(`${source}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const sdk = readSdkInstance(env.window);
    if (sdk) {
      return { sdk, source, initTimeMs: await initializeSdk(sdk, env.now) };
    }
    failures.push(`${source}: loaded but produced no SDK instance`);
  }

  const detail = failures.length
    ? ` Attempted: ${failures.join(" | ")}.`
    : " No SDK sources were configured.";
  throw new Error(`Mini App SDK did not initialize after loading.${detail}`);
}

/** Tears down the instance on a given window — separate for testability. */
export function destroySdkInstance(
  w: Window & typeof globalThis,
): void {
  const sdk = readSdkInstance(w);
  if (sdk) sdk.destroy();
}
