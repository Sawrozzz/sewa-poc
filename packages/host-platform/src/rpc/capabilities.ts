/**
 * Capability resolution and gating.
 *
 * A mini app's manifest declares what it is allowed to reach through the SDK.
 * An entry is either a whole namespace ("device", "http") or a single method
 * inside one ("device.location"). Anything that is not granted is refused at
 * the RPC boundary with PERMISSION_DENIED — the call never reaches a shell
 * service, so an app that declares nothing can do nothing.
 */

import { NAMESPACES, SDK_CAPABILITIES } from "../constants";

/**
 * Namespaces every connected mini app gets regardless of what it declares.
 *
 * `handshake` is the connect call itself; `sdk.initialize()` then calls
 * `platform.getType` and subscribes to appearance events, and `appearance` /
 * `navigation` carry the shell's own locale-theme and back-button handshakes.
 * `auth` is here because a mini app cannot render anything useful without
 * knowing who is signed in — every one of them asks on mount, and a shell that
 * refused it would break each app on its first call rather than on the one
 * capability it was actually denied.
 *
 * These are granted, not merely default: {@link isCapabilityGranted} lets them
 * through whatever the declared list says, so a mini app cannot opt out of them
 * and the registry cannot revoke them per app. Anything a mini app should be
 * able to be refused — `device`, `http`, `storage`, `api` — belongs in its own
 * declared capabilities instead, never here.
 */
export const CORE_CAPABILITIES: readonly string[] = [
  NAMESPACES.HANDSHAKE,
  NAMESPACES.PLATFORM,
  NAMESPACES.EVENT,
  NAMESPACES.APPEARANCE,
  NAMESPACES.NAVIGATION,
  NAMESPACES.AUTH,
];

/** Everything the host serves — what a wildcard grant expands to. */
export const ALL_CAPABILITIES: readonly string[] = Array.from(
  new Set<string>([...SDK_CAPABILITIES, NAMESPACES.EVENT]),
);

/** A manifest — or anything else carrying a capability list. */
export interface CapabilityGrantSource {
  /** Declared by the mini app and published by the registry. */
  capabilities?: readonly string[] | null;
}

/** Trims, lower-cases and de-duplicates a raw capability list. */
export function normalizeCapabilities(input?: readonly string[] | null): string[] {
  if (!input) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const entry = raw.trim().toLowerCase();
    if (entry && !out.includes(entry)) out.push(entry);
  }
  return out;
}

/**
 * The effective grant for a module: declared ∪ core, with a wildcard expanding
 * to every namespace the host serves.
 *
 * A missing manifest resolves to the core set alone — an unknown module is
 * granted nothing beyond what it needs to connect.
 *
 * Idempotent: passing a list this function already produced returns the same
 * set, so a manifest cached with its resolved grant can be re-resolved safely.
 */
export function resolveCapabilities(source?: CapabilityGrantSource | null): string[] {
  const granted = normalizeCapabilities(source?.capabilities);
  return Array.from(new Set<string>([...granted, ...CORE_CAPABILITIES]));
}

export function isCapabilityGranted(
  granted: readonly string[],
  namespace: string,
  action?: string,
): boolean {
  const ns = namespace.trim().toLowerCase();
  if (CORE_CAPABILITIES.includes(ns)) return true;

  const act = action?.trim().toLowerCase();
  return granted.some((entry) => {
    if (entry === ns || entry === `${ns}.*`) return true;
    return Boolean(act) && entry === `${ns}.${act}`;
  });
}
