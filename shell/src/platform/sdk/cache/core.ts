/**
 * Cache orchestration. No DOM, no IndexedDB — everything arrives through
 * `SdkCacheEnv`, which is what lets this file be unit-tested in plain Node the
 * same way `sdk/bootstrap/core.ts` is.
 *
 * The governing invariant: **the cache is never a single point of failure.**
 * Every path out of here that is not a clean hit ends at `env.fallback`, which
 * is the plain `<script src>` the shell used before any of this existed. The
 * one deliberate exception is a digest mismatch, which fails loudly rather
 * than quietly re-fetching bytes that already failed verification.
 */

import { SdkIntegrityError } from "@/shared/lib";
import type {
  CachedSdkBundle,
  SdkCacheEnv,
  SdkCacheResult,
  SdkSpec,
  SdkStore,
} from "@/types/platform";
import { bundleKey } from "./config";
import { downloadBundle } from "./fetch";

/**
 * Re-verifies a stored record before executing it.
 *
 * Cheap for a ~21 KB bundle, and it is the only thing standing between a
 * half-written or bit-rotted IndexedDB row and `document.head`.
 */
async function isRecordSound(
  record: CachedSdkBundle,
  env: Pick<SdkCacheEnv, "digest">,
): Promise<boolean> {
  try {
    const actual = await env.digest(await record.content.arrayBuffer());
    return actual === record.integrity;
  } catch (err) {
    console.warn("[SdkCache] Could not verify cached record:", record.key, err);
    return false;
  }
}

/**
 * Retains the `keep` most recently used versions of `name`, never touching
 * `protect`. LRU rather than the FIFO used for mini-app bundles: FIFO would
 * happily evict the version currently running in favour of one that was merely
 * prefetched.
 */
async function collectGarbage(
  store: SdkStore,
  name: string,
  keep: number,
  protect: string,
): Promise<void> {
  const held = await store.listByName(name);
  if (held.length <= keep) return;

  const doomed = held
    .slice()
    .sort((a, b) => Number(b.lastUsedAt) - Number(a.lastUsedAt))
    .slice(keep)
    .filter((record) => record.key !== protect);

  for (const record of doomed) {
    await store.delete(record.key).catch((err) => {
      console.warn("[SdkCache] Eviction failed for:", record.key, err);
    });
  }
  if (doomed.length) {
    console.log("[SdkCache] Evicted", doomed.map((r) => r.key).join(", "));
  }
}

/** Records what actually ran. Written after execution, never before. */
async function promote(store: SdkStore, spec: SdkSpec, at: number): Promise<void> {
  await store.setActive({
    key: "active",
    name: spec.name,
    version: spec.version,
    pinnedBy: spec.pinnedBy,
    promotedAt: at,
  });
}

/**
 * Stores a freshly downloaded bundle, making room once if quota is the
 * problem. Returns false when the bytes could not be persisted — the caller
 * still executes them, just without the benefit of caching.
 */
async function persist(store: SdkStore, record: CachedSdkBundle): Promise<boolean> {
  try {
    await store.put(record);
    return true;
  } catch (err) {
    console.warn("[SdkCache] Store failed, retrying after eviction:", err);
    try {
      await collectGarbage(store, record.name, 0, record.key);
      await store.put(record);
      return true;
    } catch (retryErr) {
      console.warn("[SdkCache] Store failed after eviction, running unstored:", retryErr);
      return false;
    }
  }
}

/**
 * Falls back to the last version known to have executed successfully.
 *
 * This is what the `active` pointer is for. Offline with a freshly bumped
 * target version, the choice is between running the previous build and running
 * nothing at all — and the pointer guarantees the previous build is one that
 * genuinely worked, not merely one that was downloaded.
 */
async function tryLastKnownGood(
  store: SdkStore,
  spec: SdkSpec,
  env: SdkCacheEnv,
): Promise<CachedSdkBundle | null> {
  const pointer = await store.getActive().catch(() => null);
  if (!pointer || pointer.version === spec.version) return null;

  const record = await store.get(bundleKey(pointer.name, pointer.version)).catch(() => null);
  if (!record || !(await isRecordSound(record, env))) return null;
  return record;
}

/**
 * Ensures the SDK bytes for `spec` are executing on this page, preferring
 * IndexedDB and degrading in this order:
 *
 *   1. exact version cached and sound  → run it
 *   2. download, verify, store         → run it
 *   3. network failed, older build     → run the last known-good version
 *   4. anything else                   → plain `<script src>` at the CDN
 */
export async function loadSdkBundle(spec: SdkSpec, env: SdkCacheEnv): Promise<SdkCacheResult> {
  const startedAt = env.now();
  const elapsed = () => Math.round(env.now() - startedAt);

  const bail = async (reason: string): Promise<SdkCacheResult> => {
    await env.fallback(spec);
    return { outcome: "fallback", version: spec.version, loadTimeMs: elapsed(), reason };
  };

  let store: SdkStore;
  try {
    store = await env.openStore();
  } catch (err) {
    return bail(`store unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

  const key = bundleKey(spec.name, spec.version);

  // 1. Exact hit.
  const cached = await store.get(key).catch(() => null);
  if (cached) {
    if (await isRecordSound(cached, env)) {
      await env.execute(cached.content);
      const at = env.now();
      // Best-effort bookkeeping: a failure here must not fail the load.
      void store.touch(key, at).catch(() => {});
      void promote(store, spec, at).catch(() => {});
      return { outcome: "cache-hit", version: spec.version, loadTimeMs: elapsed() };
    }
    console.warn("[SdkCache] Cached record failed verification, discarding:", key);
    await store.delete(key).catch(() => {});
  }

  // 2. Download.
  let downloaded: CachedSdkBundle;
  try {
    downloaded = await downloadBundle(spec, env);
  } catch (err) {
    // A digest mismatch is not a transient failure. Re-fetching the same bytes
    // through a `<script>` would fail the same check with a worse error, so
    // surface it instead.
    if (err instanceof SdkIntegrityError) {
      console.error("[SdkCache]", err.message);
      throw err;
    }

    // 3. Network problem — an older verified build beats no SDK at all.
    const stale = await tryLastKnownGood(store, spec, env).catch(() => null);
    if (stale) {
      console.warn(`[SdkCache] ${spec.version} unreachable, running cached ${stale.version}`);
      await env.execute(stale.content);
      void store.touch(stale.key, env.now()).catch(() => {});
      return {
        outcome: "stale-hit",
        version: stale.version,
        loadTimeMs: elapsed(),
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    return bail(err instanceof Error ? err.message : String(err));
  }

  // Two-phase write: the record lands first, the pointer only after the bytes
  // have actually run. A crash in between leaves the pointer naming a record
  // that is complete and known-good.
  const stored = await persist(store, downloaded);

  await env.execute(downloaded.content);
  const at = env.now();
  if (stored) {
    void promote(store, spec, at).catch(() => {});
    void collectGarbage(store, spec.name, env.keepVersions, key).catch(() => {});
  }

  return {
    outcome: stored ? "downloaded" : "downloaded-unstored",
    version: spec.version,
    loadTimeMs: elapsed(),
  };
}

export type WarmOutcome = "already-cached" | "downloaded" | "skipped";

/**
 * Downloads and stores `spec` without executing it.
 *
 * Two reasons this never promotes the pointer. First, promotion means "this
 * version ran successfully", which prefetching cannot attest to. Second, a
 * newly published version should not first execute in the same session that
 * downloaded it — that gap is what makes a bad release detectable before it is
 * everywhere.
 */
export async function warmSdkBundle(spec: SdkSpec, env: SdkCacheEnv): Promise<WarmOutcome> {
  let store: SdkStore;
  try {
    store = await env.openStore();
  } catch {
    return "skipped";
  }

  const key = bundleKey(spec.name, spec.version);
  const existing = await store.get(key).catch(() => null);
  if (existing && (await isRecordSound(existing, env))) return "already-cached";

  try {
    const record = await downloadBundle(spec, env);
    await store.put(record);
    void collectGarbage(store, spec.name, env.keepVersions, key).catch(() => {});
    return "downloaded";
  } catch (err) {
    if (err instanceof SdkIntegrityError) console.error("[SdkCache]", err.message);
    else console.warn("[SdkCache] Warm failed:", err);
    return "skipped";
  }
}

/** Field kill switch: drop everything and let the CDN path take over. */
export async function purgeSdkBundles(env: Pick<SdkCacheEnv, "openStore">): Promise<void> {
  try {
    const store = await env.openStore();
    await store.clear();
  } catch (err) {
    console.warn("[SdkCache] Purge failed:", err);
  }
}
