/**
 * Download + verify. Produces a complete `CachedSdkBundle` but does not store
 * it — storing and pointer promotion are the caller's ordering concern.
 */

import type { CachedSdkBundle, SdkCacheEnv, SdkSpec } from "@/types/platform";
import { verify } from "@/utils";
import { bundleKey } from "./config";

type FetchEnv = Pick<SdkCacheEnv, "fetch" | "now">;

/**
 * Fetches `spec.url`, verifies it against the pinned digest, and returns a
 * ready-to-store record.
 *
 * Throws `SdkIntegrityError` on a digest mismatch — that case must never be
 * stored or executed, since it means either a compromised CDN or a bad pin.
 */
export async function downloadBundle(spec: SdkSpec, env: FetchEnv): Promise<CachedSdkBundle> {
  if (!spec?.url || !spec?.integrity)
    throw new Error("Invalid SdkSpec: url and integrity required");
  let response: Response;
  try {
    response = await env.fetch(spec.url, { credentials: "omit" });
  } catch (err) {
    throw new Error(
      `SDK fetch failed for ${spec.url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    throw new Error(`SDK download failed: ${response.status} ${response.statusText}`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("SDK bundle too large");
  const integrity = await verify(bytes, spec.integrity, spec.url);
  const at = new Date(env.now()).toISOString();

  const lm = response.headers.get("last-modified");
  const lastModified = lm ? new Date(lm).toISOString() : undefined;

  return {
    key: bundleKey(spec.name, spec.version),
    name: spec.name,
    version: spec.version,
    content: new Blob([bytes], { type: "text/javascript" }),
    integrity,
    size: bytes.byteLength,
    sourceUrl: spec.url,
    etag: response.headers.get("etag") ?? undefined,
    lastModified: lastModified,
    cachedAt: at,
    lastUsedAt: at,
  };
}
