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
const DEFAULT_SDK_VERSION = "1.0.4";

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
};

/** localStorage key for the field kill switch. `"off"` bypasses + purges. */
export const SDK_CACHE_SWITCH_KEY = "sewa.sdk.cache";

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
}

/**
 * Resolves the build to load. An explicit `source` wins over the configured
 * template but forfeits the pinned digest unless one happens to be registered
 * for that exact name+version.
 */
export function resolveSdkSpec(overrides: SdkSpecOverrides = {}): SdkSpec {
  const name = SDK_NAME;
  const version = overrides.sdkVersion || SDK_VERSION;
  const key = bundleKey(name, version);
  const pinned = PINNED_INTEGRITY[key] || process.env.NEXT_PUBLIC_SDK_INTEGRITY || undefined;

  return {
    name,
    version,
    url: overrides.source || buildUrl(name, version),
    // A hand-supplied source may point anywhere; only trust a digest that was
    // pinned for this exact name@version.
    integrity: overrides.source && !PINNED_INTEGRITY[key] ? undefined : pinned,
    pinnedBy: "host-default",
  };
}

/** Reads the localStorage kill switch. Absent/unreadable → null. */
function readSwitch(): "on" | "off" | null {
  try {
    const raw = globalThis.localStorage?.getItem(SDK_CACHE_SWITCH_KEY);
    return raw === "on" || raw === "off" ? raw : null;
  } catch {
    // Storage can throw outright under some privacy settings.
    return null;
  }
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
  const override = readSwitch();
  if (override) return override === "on";
  return process.env.NEXT_PUBLIC_SDK_CACHE !== "off";
}

export { DEFAULT_SDK_VERSION };
