/**
 * Bundle integrity helpers.
 *
 * The signed manifest advertises each mini-app's archive digest as
 * `bundleHash`. Before a downloaded `.zip` is unpacked, its bytes are hashed
 * and compared against that value — a mismatch means the archive was tampered
 * with or truncated in transit, and it is discarded without being evaluated.
 */

/** Accepted `bundleHash` prefixes, mapping to the Web Crypto digest name */
const HASH_ALGORITHMS: Record<string, string> = {
  sha256: "SHA-256",
  sha384: "SHA-384",
  sha512: "SHA-512",
};

/**
 * Split a manifest `bundleHash` into its algorithm and expected digest.
 *
 * Accepts both the SRI-flavoured `sha256-<hex|base64>` form used by the
 * registry and a bare hex digest (assumed SHA-256).
 *
 * @param bundleHash - Hash string from the manifest
 * @returns Web Crypto algorithm name and the normalized expected digest
 */
function parseBundleHash(bundleHash: string): { algorithm: string; expected: string } {
  const separator = bundleHash.indexOf("-");
  if (separator < 0) {
    return { algorithm: "SHA-256", expected: bundleHash.trim().toLowerCase() };
  }
  const prefix = bundleHash.slice(0, separator).trim().toLowerCase();
  const algorithm = HASH_ALGORITHMS[prefix];
  if (!algorithm) {
    throw new Error(`Unsupported bundle hash algorithm "${prefix}"`);
  }
  return { algorithm, expected: bundleHash.slice(separator + 1).trim() };
}

/**
 * Convert a digest to lowercase hex.
 *
 * @param digest - Raw digest bytes
 * @returns Hex representation
 */
function toHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert a digest to standard base64.
 *
 * @param digest - Raw digest bytes
 * @returns Base64 representation
 */
function toBase64(digest: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Hash bundle bytes and compare against the manifest's advertised digest.
 *
 * @param bytes - The downloaded archive
 * @param bundleHash - Expected hash, e.g. "sha256-3193…b2d6"
 * @returns Whether the digests match, alongside the digest that was computed
 *
 * @example
 * ```typescript
 * const { matches, actual } = await verifyBundleHash(zipBytes, app.bundleHash);
 * if (!matches) throw new Error(`Bundle hash mismatch: ${actual}`);
 * ```
 */
export async function verifyBundleHash(
  bytes: Uint8Array,
  bundleHash: string,
): Promise<{ matches: boolean; actual: string }> {
  const { algorithm, expected } = parseBundleHash(bundleHash);
  const digest = await crypto.subtle.digest(algorithm, bytes as unknown as BufferSource);
  const hex = toHex(digest);
  // The registry emits hex today; base64 is accepted so an SRI-style digest
  // from the same publisher pipeline still validates.
  const matches = expected === hex || expected === toBase64(digest);
  return { matches, actual: hex };
}
