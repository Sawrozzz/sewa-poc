/**
 * Which SDK build should run, and whether the cache is allowed to serve it.
 *
 * This is the single source of truth for SDK identity. `sdk-bootstrap`'s
 * `DEFAULT_SDK_SOURCE` is derived from here rather than the other way round,
 * so the dependency runs in one direction only: bootstrap → cache.
 */

import type { SdkSpec } from "@/types/platform";

/** npm package the host loads. */
const DEFAULT_SDK_NAME = "@lizuz/sewa-sdk";

/** Version the shell ships pinned to. Overridable via env. */
const DEFAULT_SDK_VERSION = "1.0.8";

/**
 * `{name}` / `{version}` placeholders. jsDelivr serves the bundle with
 * `access-control-allow-origin: *`, which `fetch()` and SRI both require.
 */
const DEFAULT_URL_TEMPLATE = "https://cdn.jsdelivr.net/npm/{name}@{version}/dist/sewa-sdk.min.js";

/**
 * Digests pinned at build time, keyed by `name@version`.
 *
 * A map rather than a single constant on purpose: bumping
 * `NEXT_PUBLIC_SDK_VERSION` to a version with no pinned digest degrades to
 * trust-on-first-use instead of failing closed and taking the platform down.
 *
 * Regenerate with:
 *   curl -sL <url> | openssl dgst -sha256 -binary | openssl base64 -A
 */
const PINNED_INTEGRITY: Readonly<Record<string, string>> = {
  "@lizuz/sewa-sdk@1.0.4": "sha256-K5PeFrm9KI8BNHZGuJzRS3lt0rdgVbE5qXH1JL+/310=",
  "@lizuz/sewa-sdk@1.0.8": "sha256-rZ4pn6BQqcaOusFUKr4qWSBZCYLuHEjvkTQTTjKkp8Q=",
};

/** localStorage key for the field kill switch. `"off"` bypasses + purges. */
export const SDK_CACHE_SWITCH_KEY = "sewa.sdk.cache";

/**
 * localStorage key for the local-build switch. `"on"` serves the SDK straight
 * from `shell/public/sdk/sewa-sdk.min.js`. Runtime twin of
 * `NEXT_PUBLIC_SDK_LOCAL`, so a build under test can be flipped in one browser
 * without a rebuild.
 */
export const SDK_LOCAL_SWITCH_KEY = "sewa.sdk.local";

/** Path the self-hosted build is served from (`shell/public/sdk/…`). */
export const SDK_LOCAL_SOURCE = process.env.NEXT_PUBLIC_SDK_LOCAL_SOURCE || "/sdk/sewa-sdk.min.js";

export const SDK_NAME = process.env.NEXT_PUBLIC_SDK_NAME || DEFAULT_SDK_NAME;
export const SDK_VERSION = process.env.NEXT_PUBLIC_SDK_VERSION || DEFAULT_SDK_VERSION;

export function bundleKey(name: string, version: string): string {
  return `${name}@${version}`;
}

function buildUrl(name: string, version: string): string {
  const template = process.env.NEXT_PUBLIC_SDK_URL_TEMPLATE || DEFAULT_URL_TEMPLATE;
  return template.replace("{name}", name).replace("{version}", version);
}

/** URL for the shell's pinned build. Backs `DEFAULT_SDK_SOURCE`. */
export const DEFAULT_SDK_SOURCE = buildUrl(SDK_NAME, SDK_VERSION);

export interface SdkSpecOverrides {
  /** Explicit bundle URL. Disables digest pinning — the bytes are unknown. */
  source?: string;
  /** Version override; still resolves a pinned digest if one exists. */
  sdkVersion?: string;
  /**
   * Force the self-hosted build on (`true`) or off (`false`) for this call.
   * Omitted, the `NEXT_PUBLIC_SDK_LOCAL` / localStorage switch decides.
   */
  local?: boolean;
}

/**
 * Resolves the build to load. An explicit `source` wins over the configured
 * template but forfeits the pinned digest — the bytes behind a hand-supplied
 * URL are not the bytes the pin was taken from.
 *
 * Local mode is a third case: same package identity, but the version carries a
 * `-local` suffix so the self-hosted bytes can never collide with the CDN
 * build in the IndexedDB cache, and `pinnedBy: "local"` tells `loadSdkScript`
 * to skip the cache altogether.
 */
export function resolveSdkSpec(overrides: SdkSpecOverrides = {}): SdkSpec {
  const name = SDK_NAME;
  const version = overrides.sdkVersion || SDK_VERSION;

  if (overrides.local ?? isLocalSdk()) {
    return {
      name,
      version: `${version}-local`,
      url: overrides.source || SDK_LOCAL_SOURCE,
      // A build under test is unpinnable by definition — it changes every time
      // the SDK is rebuilt.
      integrity: undefined,
      pinnedBy: "local",
    };
  }

  const key = bundleKey(name, version);
  const pinned = PINNED_INTEGRITY[key] || process.env.NEXT_PUBLIC_SDK_INTEGRITY || undefined;

  return {
    name,
    version,
    url: overrides.source || buildUrl(name, version),
    integrity: overrides.source ? undefined : pinned,
    pinnedBy: "host-default",
  };
}

/** Reads a localStorage on/off switch. Absent/unreadable → null. */
function readSwitch(key: string): "on" | "off" | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw === "on" || raw === "off" ? raw : null;
  } catch {
    // Storage can throw outright under some privacy settings.
    return null;
  }
}

/**
 * Whether to serve the SDK from `public/sdk/` instead of the CDN.
 *
 * For testing an SDK build before it is published: drop the freshly built
 * `sewa-sdk.min.js` into `shell/public/sdk/`, then either set
 * `NEXT_PUBLIC_SDK_LOCAL=on` for the whole build, or run
 * `localStorage.setItem('sewa.sdk.local', 'on')` in one browser. Off by
 * default, so the normal CDN + cache path is untouched.
 */
export function isLocalSdk(): boolean {
  const override = readSwitch(SDK_LOCAL_SWITCH_KEY);
  if (override) return override === "on";
  return process.env.NEXT_PUBLIC_SDK_LOCAL === "on";
}

/**
 * Whether the IndexedDB path may be used at all.
 *
 * Defaults to enabled: every failure mode inside the cache falls through to
 * the plain `<script src>` that shipped before it, so the downside of being on
 * is bounded. Turn it off per-build with `NEXT_PUBLIC_SDK_CACHE=off`, or in a
 * single browser at runtime with
 * `localStorage.setItem('sewa.sdk.cache', 'off')` — the latter is the field
 * kill switch and also triggers a purge on next load.
 */
export function isSdkCacheEnabled(): boolean {
  const override = readSwitch(SDK_CACHE_SWITCH_KEY);
  if (override) return override === "on";
  return process.env.NEXT_PUBLIC_SDK_CACHE !== "off";
}

export { DEFAULT_SDK_VERSION };
