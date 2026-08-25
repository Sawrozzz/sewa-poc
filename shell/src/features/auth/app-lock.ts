/**
 * App Lock — a device-local 4-digit PIN gate shown on top of the authenticated
 * app, independent of the OTP/session auth. Everything here is client-only
 * storage bookkeeping; there is no server round-trip.
 *
 * - `localStorage` (via `privileged`, so the guard's mini-app stub doesn't see
 *   it) holds whether the feature is on and the PIN's hash, so both survive
 *   app restarts.
 * - `sessionStorage` holds whether the current app session has already been
 *   unlocked. A PWA launch gets a fresh session storage, so this is what
 *   makes the PIN prompt reappear "every time the app opens" without also
 *   re-prompting on every in-app navigation.
 */

import { privileged } from "@/platform/host-privileges";

export const APP_LOCK_PIN_LENGTH = 4;

const ENABLED_KEY = "sewa.appLock.enabled";
const PIN_HASH_KEY = "sewa.appLock.pinHash";
const PROMPTED_KEY = "sewa.appLock.prompted";
const UNLOCKED_KEY = "sewa.appLock.unlocked";

async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isAppLockEnabled(): boolean {
  return privileged.localStorage?.getItem(ENABLED_KEY) === "true";
}

export function hasAppLockPrompted(): boolean {
  return privileged.localStorage?.getItem(PROMPTED_KEY) === "true";
}

export function markAppLockPrompted(): void {
  try {
    privileged.localStorage?.setItem(PROMPTED_KEY, "true");
  } catch {
    // Private mode / storage disabled — the prompt simply shows again next time.
  }
}

/** Hashes and stores `pin`, then flips the feature on. */
export async function setAppLockPin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  try {
    privileged.localStorage?.setItem(PIN_HASH_KEY, hash);
    privileged.localStorage?.setItem(ENABLED_KEY, "true");
  } catch {
    // Private mode / storage disabled — lock can't persist, feature is a no-op.
  }
}

export async function verifyAppLockPin(pin: string): Promise<boolean> {
  const stored = privileged.localStorage?.getItem(PIN_HASH_KEY);
  if (!stored) return false;
  return (await hashPin(pin)) === stored;
}

/** Turns the feature off and forgets the PIN — re-enabling always sets a fresh one. */
export function disableAppLock(): void {
  try {
    privileged.localStorage?.setItem(ENABLED_KEY, "false");
    privileged.localStorage?.removeItem(PIN_HASH_KEY);
  } catch {
    // Private mode / storage disabled.
  }
}

export function isAppUnlockedThisSession(): boolean {
  return privileged.sessionStorage?.getItem(UNLOCKED_KEY) === "true";
}

export function markAppUnlockedThisSession(): void {
  try {
    privileged.sessionStorage?.setItem(UNLOCKED_KEY, "true");
  } catch {
    // Private mode / storage disabled — the unlock simply doesn't stick.
  }
}
