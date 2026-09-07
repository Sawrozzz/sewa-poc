/**
 * Persists the guest-mode flag so the dashboard (`AppShell`) renders without
 * a live auth session. Read from `page.tsx` / `AppShell` and friends anywhere
 * the session-less gate would otherwise block the guest flow.
 */

import { privileged } from "../../platform/host-privileges";

export const GUEST_MODE_KEY = "sewa.guestMode";

export function isGuestMode(): boolean {
  return (
    typeof window !== "undefined" && privileged.localStorage?.getItem(GUEST_MODE_KEY) === "true"
  );
}

export function markAsGuest(): void {
  try {
    privileged.localStorage?.setItem(GUEST_MODE_KEY, "true");
  } catch {
    // Private mode / storage disabled — guest flag can't persist.
  }
}

export function clearGuestMode(): void {
  try {
    privileged.localStorage?.removeItem(GUEST_MODE_KEY);
  } catch {
    // ignore
  }
}
