import type { MiniAppSdkInterface } from "@lizuz/mini-app-types";

/**
 * Host-side bootstrap for the Mini App SDK (`@lizuz/sewa-sdk` v1.x).
 *
 * Contract (documented in the SDK's README and `src/cdn.ts`):
 *  - The host seeds `window.__GSA_SDK__` with a `MiniAppSdkOptions` object
 *    BEFORE the SDK `<script>` runs. The bundle reads it, constructs a single
 *    `MiniAppSdk`, and stores the live instance back on the same key.
 *  - `window.__GSA_HOST_DESCRIPTOR__` is read at construction time to expose
 *    the static host descriptor (type, version, capabilities, sdkVersion).
 *  - One instance per tab; `destroy()` removes it from the global again.
 *
 * The two global keys below mirror the SDK's own constants
 * (`SDK_GLOBAL_KEY` / `HOST_DESCRIPTOR_GLOBAL_KEY`). They live here as the
 * host's single source of truth so no other host code hardcodes the strings.
 * If the SDK renames a key, update this module (and bump the pinned version).
 *
 * The core logic (`bootstrapMiniAppSdk`) is environment-injected and free of
 * direct DOM access, so it can be unit-tested without a browser. The browser
 * adapter (`loadMiniAppSdk` / `destroyMiniAppSdk`) is a thin wrapper.
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

export interface MiniAppSdkHostOptions {
  /** RPC request timeout, ms. Defaults to 30000. */
  timeout?: number;
  /** Handshake/request retry attempts. Defaults to 5. */
  retryAttempts?: number;
  /** Retry base delay, ms. Defaults to 500. */
  retryDelayMs?: number;
  /** Ceiling for exponential retry backoff, ms. Defaults to 10000. */
  maxRetryDelayMs?: number;
  /** Host shell release version advertised in the host descriptor. */
  hostVersion?: string;
  /** The SDK package version the bundle is expected to be. */
  sdkVersion?: string;
  /** Host capability strings advertised to mini apps. */
  capabilities?: readonly string[];
  /** Bundle sources tried in order (overrides `DEFAULT_SDK_SOURCES`). */
  sources?: readonly string[];
}

export interface MiniAppSdkLoadResult {
  sdk: MiniAppSdkInterface;
  /** Which source produced the instance ("existing" or a bundle URL). */
  source: string;
  /** Wall time of the `initialize()` handshake, in milliseconds. */
  initTimeMs: number;
}

/** Injectable environment so the core logic is testable without a DOM. */
export interface SdkBootstrapEnv {
  window: Window & typeof globalThis;
  loadScript: (source: string) => Promise<void>;
  now: () => number;
}

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

// ---------------------------------------------------------------------------
// Browser adapters
// ---------------------------------------------------------------------------

/**
 * Injects the SDK `<script>` and resolves when it has executed. A bundle that
 * throws *during evaluation* still fires the script `load` event, so an
 * uncaught-exception trap (`window` `error` events) is used to reject instead
 * of letting a silently-broken bundle through.
 */
function loadBrowserScript(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("error", onEvalError);
      run();
    };
    const onEvalError = (event: Event) => {
      // Resource load failures surface as plain `Event`s; uncaught exceptions
      // are `ErrorEvent`s. Only the latter indicate a broken bundle.
      if (!(event instanceof ErrorEvent)) return;
      settle(() =>
        reject(
          new Error(`SDK bundle threw during evaluation: ${event.message}`),
        ),
      );
    };
    window.addEventListener("error", onEvalError);
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.onload = () => settle(resolve);
    script.onerror = () =>
      settle(() => reject(new Error(`Failed to load SDK from ${source}`)));
    document.head.appendChild(script);
  });
}

/** Browser entry point: ensures a live, initialized SDK instance. */
export function loadMiniAppSdk(
  miniAppId: string,
  options: MiniAppSdkHostOptions = {},
): Promise<MiniAppSdkLoadResult> {
  return bootstrapMiniAppSdk(miniAppId, options, {
    window,
    loadScript: loadBrowserScript,
    now: () => performance.now(),
  });
}

/** Tears down the live SDK instance (no-op when none is present). */
export function destroyMiniAppSdk(): void {
  destroySdkInstance(window);
}

/** Tears down the instance on a given window — separate for testability. */
export function destroySdkInstance(
  w: Window & typeof globalThis,
): void {
  const sdk = readSdkInstance(w);
  if (sdk) sdk.destroy();
}
