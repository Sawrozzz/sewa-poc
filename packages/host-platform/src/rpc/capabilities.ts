import { NAMESPACES, SDK_CAPABILITIES } from "../constants";

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
export interface DataCapabilitiesSource {
  /** Declared by the mini app and published by the registry. */
  dataCapabilities?: readonly string[] | null;
}
export interface MiniAppCapabilitiesSource {
  /** Declared by the mini app and published by the registry. */
  miniAppCapabilities?: readonly string[] | null;
}

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
export function resolveDataCapabilities(source?: DataCapabilitiesSource | null): string[] {
  const granted = normalizeCapabilities(source?.dataCapabilities);
  return Array.from(new Set<string>([...granted, ...CORE_CAPABILITIES]));
}
export function resolveMiniAppCapabilities(source?: MiniAppCapabilitiesSource | null): string[] {
  const granted = normalizeCapabilities(source?.miniAppCapabilities);
  return Array.from(new Set<string>([...granted, ...CORE_CAPABILITIES]));
}

export function isCapabilityGranted(
  granted: readonly string[],
  namespace: string,
  action?: string,
): boolean {
  let ns = namespace.trim().toLowerCase();
  // GIC_CHAT is gated by HTTP per spec — don't require separate gic-chat grant
  if (ns === NAMESPACES.GIC_CHAT) ns = NAMESPACES.HTTP;
  if (CORE_CAPABILITIES.includes(ns)) return true;

  const act = action?.trim().toLowerCase();
  return granted.some((entry) => {
    if (entry === ns || entry === `${ns}.*`) return true;
    return Boolean(act) && entry === `${ns}.${act}`;
  });
}
