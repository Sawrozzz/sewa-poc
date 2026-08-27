import type { MiniAppSdkInterface } from "@lizuz/mini-app-types";
import type { PlatformUser } from "@sewa/host-platform";

export interface PlatformServicesConfig {
  getUser: () => PlatformUser | null;
  getAccessToken: () => string | null;
  logout: () => Promise<void>;
  navigate: (path: string) => void;
}

export interface LocalApiRequestParams {
  method?: string;
  endpoint?: string;
  path?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface LocalApiResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  error?: string;
}

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
  /** Bundle source to load (overrides `DEFAULT_SDK_SOURCE`). */
  source?: string;
  /**
   * Testing escape hatch: load the self-hosted build from
   * `shell/public/sdk/sewa-sdk.min.js` instead of the CDN, bypassing the
   * IndexedDB cache. Defaults to the `NEXT_PUBLIC_SDK_LOCAL` /
   * `localStorage["sewa.sdk.local"]` switch — see `sdk/cache/config.ts`.
   */
  local?: boolean;
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

export interface CachedSdkBundle {
  /** Composite primary key: `"@lizuz/sewa-sdk@1.0.4"`. */
  key: string;
  /** Package name. Indexed, so every held version can be enumerated for GC. */
  name: string;
  /** Exact version. Never a range, never `"latest"`. */
  version: string;
  /** The bundle bytes, `type: "text/javascript"`. */
  content: Blob;
  /** SRI-format digest of `content`: `"sha256-<base64>"`. */
  integrity: string;
  /** `content.size`, denormalised so quota math never deserialises blobs. */
  size: number;
  /** The origin that actually served these bytes. */
  sourceUrl: string;
  /** Response validators, kept for cheap conditional revalidation later. */
  etag?: string;
  lastModified?: Date | string | undefined;
  /**
   * Wall clock, never `performance.now()` — these stamps are compared across
   * page loads, and a monotonic offset means nothing to the next one.
   * IndexedDB round-trips `Date` through structured clone with its prototype
   * intact, so what comes back out of `get()` is a real `Date`.
   */
  cachedAt: Date;
  /** Wall clock. Indexed, and the sort key for the LRU sweep in `core.ts`. */
  lastUsedAt: Date;
}

/** Why a given version is the active one. Diagnostics, mostly. */
export type SdkPinReason = "host-default" | "remote-config" | "rollback" | "local";

/**
 * Pointer to the version that last executed successfully. Written *after*
 * execution, never before, so it always names a known-good record — that is
 * what makes it usable as a local rollback target when the network is down.
 */
export interface SdkPointer {
  key: "active";
  name: string;
  version: string;
  pinnedBy: SdkPinReason;
  /** Wall clock, matching `CachedSdkBundle`'s stamps. */
  promotedAt: Date;
}

/** Everything needed to locate, verify and identify one SDK build. */
export interface SdkSpec {
  name: string;
  version: string;
  /** Absolute URL the bundle is fetched from. */
  url: string;
  /**
   * Expected SRI digest. When absent the bundle is trusted on first use and
   * the computed digest is stored — later reads still verify against it, which
   * catches local corruption but not a compromised CDN.
   */
  integrity?: string;
  pinnedBy: SdkPinReason;
}

/**
 * Storage abstraction. IndexedDB is one implementation (`db.ts`); tests use an
 * in-memory one. Keeping the orchestration in `core.ts` free of IDB means it
 * can be unit-tested without a browser, matching how `sdk-bootstrap/core.ts`
 * is tested.
 */
export interface SdkStore {
  get(key: string): Promise<CachedSdkBundle | null>;
  put(bundle: CachedSdkBundle): Promise<void>;
  delete(key: string): Promise<void>;
  listByName(name: string): Promise<CachedSdkBundle[]>;
  touch(key: string, at: Date): Promise<void>;
  getActive(): Promise<SdkPointer | null>;
  setActive(pointer: SdkPointer): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

/** How the SDK bytes reached the page. Logged; useful in the field. */
export type SdkCacheOutcome =
  /** Served from IndexedDB, hash re-verified. */
  | "cache-hit"
  /** Downloaded, verified, stored, executed. */
  | "downloaded"
  /** Downloaded and verified, but storing failed. Executed from memory. */
  | "downloaded-unstored"
  /** Target version unreachable; ran the last known-good cached version. */
  | "stale-hit"
  /** Cache unusable. Ran today's plain `<script src>` path. */
  | "fallback";

export interface SdkCacheResult {
  outcome: SdkCacheOutcome;
  /** The version that actually executed. */
  version: string;
  /** Wall time of the whole load, ms. */
  loadTimeMs: number;
  /** Present when the happy path was not taken. */
  reason?: string;
}

/** Injectable environment, so `core.ts` needs neither a DOM nor IndexedDB. */
export interface SdkCacheEnv {
  /** Rejects when IndexedDB is unavailable (private mode, blocked, SSR). */
  openStore: () => Promise<SdkStore>;
  fetch: typeof fetch;
  digest: (bytes: ArrayBuffer) => Promise<string>;
  /** Execute cached bytes. Browser impl: blob URL + `<script>`. */
  execute: (blob: Blob) => Promise<void>;
  /** Last resort: today's behaviour, a plain `<script src>` at the CDN. */
  fallback: (spec: SdkSpec) => Promise<void>;
  /** Monotonic, for elapsed-time measurement only. Browser: `performance.now()`. */
  now: () => number;
  /**
   * Wall clock, for timestamps written into stored records. Separate from
   * `now` because a `performance.now()` value is meaningless the moment the
   * page it was taken on goes away. Browser: `() => new Date()`.
   */
  clock: () => Date;
  /** Versions retained per package, LRU. 2 keeps a rollback target. */
  keepVersions: number;
}
