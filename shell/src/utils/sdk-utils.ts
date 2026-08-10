/**
 * SHA-256 digests in SRI string form.
 *
 * Blob-URL execution cannot use the `integrity` attribute, so the check has to
 * happen here instead. The digest is formatted exactly as SRI expects
 * (`sha256-<base64>`) so the same constant can be handed to a `<script
 * integrity=…>` on the CDN fallback path — one value, both paths verified.
 */

/** Raised when bytes do not match the pinned digest. Never store or execute. */
export class SdkIntegrityError extends Error {
  // Assigned explicitly rather than as constructor parameter properties, which
  // Node's strip-only TypeScript support cannot compile — and these files run
  // under `node --test`.
  readonly url: string;
  readonly expected: string;
  readonly actual: string;

  constructor(url: string, expected: string, actual: string) {
    super(`SDK integrity check failed for ${url} — expected ${expected}, got ${actual}`);
    this.name = 'SdkIntegrityError';
    this.url = url;
    this.expected = expected;
    this.actual = actual;
  }
}

function toBase64(bytes: Uint8Array): string {
  // Chunked so a large bundle can never blow the argument limit of `apply`.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** SHA-256 of `bytes`, formatted as `"sha256-<base64>"`. */
export async function digest(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256-${toBase64(new Uint8Array(hash))}`;
}

/**
 * Verifies `bytes` against `expected`, throwing `SdkIntegrityError` on
 * mismatch. A missing `expected` is trust-on-first-use: the computed digest is
 * returned for storage so subsequent reads have something to verify against.
 */
export async function verify(
  bytes: ArrayBuffer,
  expected: string | undefined,
  url: string,
): Promise<string> {
  const actual = await digest(bytes);
  if (expected && expected !== actual) {
    throw new SdkIntegrityError(url, expected, actual);
  }
  return actual;
}

 /** Versions retained per package. 2 keeps a rollback target alongside current. */
export function resolveKeepVersions(): number {
  const raw = process.env.NEXT_PUBLIC_SDK_CACHE_VERSIONS;
  if (!raw) return 2;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}
