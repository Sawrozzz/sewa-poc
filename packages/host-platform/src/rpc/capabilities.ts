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
 * Namespaces every connected mini app gets regardless of its manifest.
 *
 * `handshake` is the connect call itself; `sdk.initialize()` then calls
 * `platform.getType` and subscribes to appearance events, and `appearance` /
 * `navigation` carry the shell's own locale-theme and back-button handshakes.
 * Gating these would make a narrowly-scoped app fail to start instead of
 * failing on the one call it is not allowed to make.
 */
export const CORE_CAPABILITIES: readonly string[] = [
  NAMESPACES.HANDSHAKE,
  NAMESPACES.PLATFORM,
  NAMESPACES.EVENT,
  NAMESPACES.APPEARANCE,
  NAMESPACES.NAVIGATION,
];

/** Everything the host serves — what a wildcard grant expands to. */
export const ALL_CAPABILITIES: readonly string[] = Array.from(
  new Set<string>([...SDK_CAPABILITIES, NAMESPACES.EVENT]),
);

/** Manifest entries that mean "grant everything". Testing convenience only. */
const WILDCARDS = ["*", "all"];

/** A manifest — or anything else carrying the two capability lists. */
export interface CapabilityGrantSource {
  /** Declared by the mini app and vouched for by the registry. */
  capabilities?: readonly string[] | null;
  /** Testing-only additions merged on top of `capabilities`. */
  customCapabilities?: readonly string[] | null;
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
 * The effective grant for a module: declared ∪ custom ∪ core, with a wildcard
 * in either list expanding to every namespace the host serves.
 *
 * A missing manifest resolves to the core set alone — an unknown module is
 * granted nothing beyond what it needs to connect.
 */
export function resolveCapabilities(source?: CapabilityGrantSource | null): string[] {
  const granted = [
    ...normalizeCapabilities(source?.capabilities),
    ...normalizeCapabilities(source?.customCapabilities),
  ];
  const base = granted.some((entry) => WILDCARDS.includes(entry)) ? ALL_CAPABILITIES : granted;
  return Array.from(new Set<string>([...base, ...CORE_CAPABILITIES]));
}

/**
 * Is `namespace.action` covered by `granted`?
 *
 * Matches, in order of breadth: a wildcard, the bare namespace ("device"), an
 * explicit namespace wildcard ("device.*"), or the exact method
 * ("device.location"). So a manifest granting only `device.location` gets
 * `sdk.device.location()` and is refused `sdk.device.camera()`.
 */
export function isCapabilityGranted(
  granted: readonly string[],
  namespace: string,
  action?: string,
): boolean {
  const ns = namespace.trim().toLowerCase();
  if (CORE_CAPABILITIES.includes(ns)) return true;

  const act = action?.trim().toLowerCase();
  return granted.some((entry) => {
    if (WILDCARDS.includes(entry)) return true;
    if (entry === ns || entry === `${ns}.*`) return true;
    return Boolean(act) && entry === `${ns}.${act}`;
  });
}
