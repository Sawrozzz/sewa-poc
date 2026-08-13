/**
 * Signed mini-app manifest verification.
 *
 * The registry signs the manifest it publishes with an RSA key (RS256). The
 * shell verifies that signature against the registry's public key before any
 * mini app from the manifest is shown or loaded — an unverified manifest is
 * treated as no manifest at all.
 *
 * Verification runs in the browser through Web Crypto, so it needs a secure
 * context (https, or localhost during development).
 */

import type { SignedMiniAppManifest } from "@sewa/host-platform";

/**
 * Registry manifest-signing public key.
 *
 * Override per environment with `NEXT_PUBLIC_MANIFEST_PUBLIC_KEY` (PEM, with
 * real or `\n`-escaped newlines) when the registry rotates its key.
 */
const DEFAULT_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvORpRaZETR+/FqeaBA2J
DpfJn9/xp6+SZnVoLxhWwARoY+57xUUPZiJexVo0LGSxqwIIBQGJfQWlqNfE9Pvc
phhER5KSPrxswt0j6Yh2omNWM+QOt0rLPei/+vEg/eXHLapDSvP3rq8/0ineZ4Ch
zH5kiYk8I1ExXSlED2l1PRMXrvLr4UBufIMluW0flOLJzYi4+5WPKOU9SDSA08r4
U8LsHbwk0HjM/OHbp031wrZcv7xdbHo8JxurxsTPXZA2EZubdi9txwhgEct+czTc
jctIyugDQwnnrGB6eKV41LkyZdGVWt74Nz4nZMyXDdAyUqgRlGo13cZ+vnUOnqFf
AQIDAQAB
-----END PUBLIC KEY-----`;

/** Signature algorithms this verifier understands, keyed by manifest `algorithm` */
const SUPPORTED_ALGORITHMS: Record<string, { name: string; hash: string }> = {
  RS256: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  RS384: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" },
  RS512: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
};

/** Outcome of a verification attempt */
export interface ManifestVerification {
  valid: boolean;
  /** Why verification failed, for logging and the error surface */
  reason?: string;
}

/**
 * Resolve the configured public key PEM.
 *
 * @returns PEM text with escaped newlines normalized
 */
function resolvePublicKeyPem(): string {
  const configured = process.env.NEXT_PUBLIC_MANIFEST_PUBLIC_KEY;
  return (configured?.trim() ? configured.replace(/\\n/g, "\n") : DEFAULT_PUBLIC_KEY_PEM).trim();
}

/**
 * Whether an unverified manifest should still be rendered.
 *
 * Defaults to enforcing. Set `NEXT_PUBLIC_MANIFEST_SIGNATURE_REQUIRED=false`
 * to keep working against a registry whose key pair does not yet line up — the
 * failure is still logged loudly.
 *
 * @returns True when a bad signature must block the manifest
 */
export function isSignatureEnforced(): boolean {
  return process.env.NEXT_PUBLIC_MANIFEST_SIGNATURE_REQUIRED !== "false";
}

/**
 * Decode a PEM block into its DER bytes.
 *
 * @param pem - PEM text including the header and footer lines
 * @returns Raw DER bytes
 */
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Decode a base64url signature into bytes.
 *
 * @param value - base64url (or base64) encoded signature
 * @returns Raw signature bytes
 */
function decodeSignature(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Serialize an object with its keys in a deterministic order.
 *
 * @param value - Value to canonicalize
 * @returns The same value with every object's keys sorted
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortKeysDeep(source[key]);
    return sorted;
  }
  return value;
}

/**
 * Build the payload encodings the signature may have been produced over.
 *
 * The registry does not publish which canonicalization it signs, so the four
 * plausible shapes are tried: the manifest minus `signature` and the payload
 * fields alone, each in declaration order and with keys sorted.
 *
 * @param manifest - The manifest as received
 * @returns Candidate payload strings, most likely first
 */
function signedPayloadCandidates(manifest: SignedMiniAppManifest): string[] {
  const { signature: _signature, ...withoutSignature } = manifest;
  const payloadOnly = {
    version: manifest.version,
    publishedAt: manifest.publishedAt,
    miniApps: manifest.miniApps,
  };

  return [
    JSON.stringify(payloadOnly),
    JSON.stringify(withoutSignature),
    JSON.stringify(sortKeysDeep(payloadOnly)),
    JSON.stringify(sortKeysDeep(withoutSignature)),
  ];
}

/**
 * Verify a signed manifest against the registry's public key.
 *
 * @param manifest - Manifest as returned by the registry
 * @returns Whether the signature is valid, and why not when it is not
 *
 * @example
 * ```typescript
 * const { valid, reason } = await verifyManifestSignature(manifest);
 * if (!valid) throw new Error(reason);
 * ```
 */
export async function verifyManifestSignature(
  manifest: SignedMiniAppManifest,
): Promise<ManifestVerification> {
  if (!manifest?.signature) {
    return { valid: false, reason: "Manifest is not signed" };
  }

  const algorithm = SUPPORTED_ALGORITHMS[manifest.algorithm ?? "RS256"];
  if (!algorithm) {
    return { valid: false, reason: `Unsupported signature algorithm "${manifest.algorithm}"` };
  }

  if (typeof crypto === "undefined" || !crypto.subtle) {
    return { valid: false, reason: "Web Crypto is unavailable — manifest cannot be verified" };
  }

  try {
    const key = await crypto.subtle.importKey(
      "spki",
      pemToDer(resolvePublicKeyPem()),
      { name: algorithm.name, hash: algorithm.hash },
      false,
      ["verify"],
    );

    const signature = decodeSignature(manifest.signature);

    for (const payload of signedPayloadCandidates(manifest)) {
      const verified = await crypto.subtle.verify(
        algorithm.name,
        key,
        signature,
        new TextEncoder().encode(payload),
      );
      if (verified) return { valid: true };
    }

    return {
      valid: false,
      reason: `Manifest signature does not match key "${manifest.keyId}"`,
    };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : "Manifest verification failed",
    };
  }
}
