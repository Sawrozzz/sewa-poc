import type { PlatformUser } from "@sewa/host-platform";
import { privileged } from "../host-privileges";

/** True once the Shell is running from the home screen rather than a browser tab. */
export function isInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari never reports display-mode for home-screen apps.
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }
  return ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );
}

/**
 * Credential id of the passkey this device enrolled, base64url encoded. Wiping
 * this key is how a user re-enrolls (e.g. after restoring to a new phone, where
 * the old credential no longer resolves).
 */
const BIOMETRIC_CREDENTIAL_KEY = "gov:biometric-credential";

function base64UrlEncode(buffer: ArrayBuffer): string {
  let binary = "";
  new Uint8Array(buffer).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The Uint8Array<ArrayBuffer> annotations matter: WebAuthn's BufferSource
// rejects the SharedArrayBuffer-backed default TS infers for a bare Uint8Array.
function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomChallenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
}

/** FIDO Registry §3.1 user verification methods, as reported by the `uvm` extension. */
const USER_VERIFY_FINGERPRINT = 0x00000002;

/**
 * When true, a ceremony that does not *prove* it used a fingerprint is rejected.
 * That includes every browser which declines to implement the optional `uvm`
 * extension — i.e. most of them, including on phones that do have a sensor — so
 * this trades false accepts for false rejects. Left off by default; flip it if
 * you would rather biometric() fail than let a PIN through.
 */
const STRICT_FINGERPRINT_ONLY = false;

/** Outcome of one WebAuthn ceremony, split so the caller can explain a refusal. */
type FingerprintOutcome = "verified" | "cancelled" | "not-fingerprint";

/** TypeScript's DOM lib does not type the `uvm` extension on either side. */
const UVM_EXTENSION = {
  uvm: true,
} as unknown as AuthenticationExtensionsClientInputs;

/**
 * WebAuthn cannot ask for a specific sensor — `userVerification: "required"`
 * means "verify the user somehow", and on Android the platform authenticator is
 * backed by the screen lock, so PIN and pattern satisfy it too. The `uvm`
 * extension is the only hook that reports *which* method ran, and authenticators
 * may omit it. So this is a best-effort filter, not a guarantee: a real
 * fingerprint-only policy needs the native layer (Android BiometricPrompt with
 * BIOMETRIC_STRONG and no DEVICE_CREDENTIAL, iOS
 * deviceOwnerAuthenticationWithBiometrics, Flutter local_auth biometricOnly).
 */
function checkUvm(credential: PublicKeyCredential): FingerprintOutcome {
  const { uvm } = credential.getClientExtensionResults() as {
    uvm?: number[][];
  };
  if (!uvm?.length) {
    return STRICT_FINGERPRINT_ONLY ? "not-fingerprint" : "verified";
  }
  // Each entry is [userVerificationMethod, keyProtectionType, matcherProtectionType].
  return uvm.some(([method]) => method === USER_VERIFY_FINGERPRINT)
    ? "verified"
    : "not-fingerprint";
}

/**
 * Drives the device's own fingerprint prompt through WebAuthn's platform
 * authenticator. The first call enrolls a passkey (the enrolment sheet itself
 * asks for the fingerprint), later calls assert against it.
 *
 * The challenge is generated and discarded client-side: with no server to sign
 * it back to, this proves "the device owner is present at this device", not an
 * authenticated identity. Any server-trusted flow needs a real challenge issued
 * and verified by the backend.
 */
export async function verifyFingerprint(user: PlatformUser | null): Promise<FingerprintOutcome> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return "cancelled";
  }

  // True for *any* screen lock, sensor or not — it cannot tell us a fingerprint
  // reader exists, only that user verification is possible at all.
  const hasUserVerification =
    await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  if (!hasUserVerification) return "cancelled";

  const storedId = privileged.localStorage?.getItem(BIOMETRIC_CREDENTIAL_KEY) ?? null;

  if (!storedId) {
    const created = (await privileged.credentials?.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: "Sewa", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(user?.id ?? "sewa-device-user"),
          name: user?.email ?? "sewa-device-user",
          displayName: user?.fullName ?? "Sewa user",
        },
        // ES256 first, RS256 as the fallback Windows Hello still prefers.
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
        extensions: UVM_EXTENSION,
      },
    })) as PublicKeyCredential | null;

    if (!created) return "cancelled";

    // Keep the credential either way — it can still be asserted with a
    // fingerprint later, even if enrolment itself fell back to the screen lock.
    privileged.localStorage?.setItem(BIOMETRIC_CREDENTIAL_KEY, base64UrlEncode(created.rawId));
    return checkUvm(created);
  }

  const assertion = (await privileged.credentials?.get({
    publicKey: {
      challenge: randomChallenge(),
      rpId: window.location.hostname,
      allowCredentials: [{ type: "public-key", id: base64UrlDecode(storedId) }],
      userVerification: "required",
      timeout: 60_000,
      extensions: UVM_EXTENSION,
    },
  })) as PublicKeyCredential | null;

  return assertion ? checkUvm(assertion) : "cancelled";
}
