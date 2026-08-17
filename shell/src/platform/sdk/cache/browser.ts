/**
 * Browser wiring: binds the pure orchestration in `core.ts` to IndexedDB, the
 * real `fetch`, and `<script>` injection.
 *
 * This is the module `sdk-bootstrap` talks to. Everything it exposes is safe
 * to call when IndexedDB is missing, when storage is full, or when the kill
 * switch is thrown — the worst case is the plain CDN `<script>` the shell used
 * before the cache existed.
 */

import type { SdkCacheEnv, SdkCacheResult, SdkSpec, SdkStore } from "@/types/platform";
import { digest, resolveKeepVersions } from "@/utils";
import type { SdkSpecOverrides } from "./config";
import { isSdkCacheEnabled, resolveSdkSpec } from "./config";
import { loadSdkBundle, purgeSdkBundles, warmSdkBundle } from "./core";
import { IdbSdkStore } from "./db";
import { injectBlobScript, injectScript } from "./execute";

let store: IdbSdkStore | null = null;

function openStore(): Promise<SdkStore> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("No window — SDK cache is client-only"));
  }
  store ??= new IdbSdkStore();
  return Promise.resolve(store);
}

const browserEnv: SdkCacheEnv = {
  openStore,
  fetch: (...args) => fetch(...args),
  digest,
  execute: injectBlobScript,
  fallback: (spec) => injectScript({ src: spec.url, integrity: spec.integrity }),
  now: () => performance.now(),
  keepVersions: resolveKeepVersions(),
};

/**
 * Honours the kill switch exactly once per page. Flipping the switch should
 * not just bypass the cache but also reclaim what it already stored, so a
 * browser that was serving a bad build stops holding it.
 */
let purgedForKillSwitch = false;
async function honourKillSwitch(): Promise<void> {
  if (purgedForKillSwitch) return;
  purgedForKillSwitch = true;
  await purgeSdkBundles({ openStore });
}

/**
 * Loads and executes the SDK bundle for `spec`, preferring IndexedDB.
 *
 * Shaped as `Promise<void>` so it drops straight into
 * `SdkBootstrapEnv.loadScript`; the richer result is logged rather than
 * returned, to keep `sdk/bootstrap/core.ts` untouched.
 */
export async function loadSdkScript(spec: SdkSpec): Promise<void> {
  if (!isSdkCacheEnabled()) {
    await honourKillSwitch();
    await browserEnv.fallback(spec);
    return;
  }

  const result: SdkCacheResult = await loadSdkBundle(spec, browserEnv);
  console.log(
    `[SdkCache] ${result.outcome} — ${spec.name}@${result.version} in ${result.loadTimeMs}ms` +
      (result.reason ? ` (${result.reason})` : ""),
  );
}

/**
 * Downloads the pinned bundle into IndexedDB without executing it.
 *
 * The point of the whole exercise: today the download starts the instant a
 * user opens a mini app, while they are watching the loader. Called from an
 * idle callback at portal load, this moves it out of that critical path so
 * opening a mini app becomes an IndexedDB read and a blob eval.
 */
export async function warmSdkCache(overrides: SdkSpecOverrides = {}): Promise<void> {
  if (typeof window === "undefined" || !isSdkCacheEnabled()) return;

  const spec = resolveSdkSpec(overrides);
  const outcome = await warmSdkBundle(spec, browserEnv);
  if (outcome !== "skipped") {
    console.log(`[SdkCache] Warm: ${outcome} — ${spec.name}@${spec.version}`);
  }
}

/**
 * Schedules `warmSdkCache` for the next idle period, so it never competes with
 * first paint. Returns a canceller.
 */
export function scheduleSdkWarm(overrides: SdkSpecOverrides = {}): () => void {
  if (typeof window === "undefined") return () => {};

  const run = () => void warmSdkCache(overrides).catch(() => {});

  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: 10_000 });
    return () => window.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(run, 3_000);
  return () => window.clearTimeout(handle);
}

/** Drops every cached bundle and the active pointer. */
export async function purgeSdkCache(): Promise<void> {
  await purgeSdkBundles({ openStore });
  store?.close();
  store = null;
}
