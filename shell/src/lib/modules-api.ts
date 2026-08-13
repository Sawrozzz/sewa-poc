import type { ModuleManifest, OldModuleManifest, SignedMiniAppManifest } from "@sewa/host-platform";
import axios from "axios";
import type { ManifestVersion } from "@/types/manifest";
import { clearMiniAppsManifest, getStoredMiniAppsManifest, saveMiniAppsManifest } from "./index-db";
import { isSignatureEnforced, verifyManifestSignature } from "./manifest-signature";
import { FALLBACK_MINI_APPS } from "./mock-mini-apps";

/**
 * Check a manifest's signature, applying the enforcement policy.
 *
 * @param manifest - Manifest to check
 * @param origin - Where it came from, for the log line
 * @returns True when the manifest may be used
 * @throws When the signature is bad and enforcement is on
 */
async function assertManifestTrusted(
  manifest: SignedMiniAppManifest,
  origin: "registry" | "cache",
): Promise<boolean> {
  const { valid, reason } = await verifyManifestSignature(manifest);

  if (valid) {
    console.log(`[manifest] Signature verified (${origin}) with key:`, manifest.keyId);
    return true;
  }

  console.error(`[manifest] Signature verification FAILED (${origin}):`, reason);
  if (isSignatureEnforced()) {
    throw new Error(`Manifest signature verification failed — ${reason}`);
  }
  console.warn("[manifest] Signature enforcement is disabled — showing unverified mini apps");
  return true;
}

/**
 * Download the manifest from the registry, verify it, and store it.
 *
 * @returns The verified manifest
 * @throws When the network fails, or the signature does not verify under
 *   enforcement — in which case nothing is stored, because an unverified
 *   manifest must not outlive the request that produced it
 */
async function fetchManifestFromRegistry(): Promise<SignedMiniAppManifest> {
  const response = await axios.get<SignedMiniAppManifest>("/api/manifests");
  const manifest = response.data;

  await assertManifestTrusted(manifest, "registry");
  await saveMiniAppsManifest(manifest);

  return manifest;
}

/**
 * Ask the registry which manifest version is current.
 *
 * This is the cheap check that decides whether the stored manifest is still
 * good — it must stay far smaller than downloading the whole manifest,
 * otherwise there is no point calling it.
 *
 * @returns The published manifest version
 */
export async function verifyVersion(): Promise<ManifestVersion> {
  const response = await axios.get<ManifestVersion>("/api/manifest-version");
  return response.data;
}

/**
 * Whether the stored manifest is the version the registry currently publishes.
 *
 * Compared as strings because the manifest carries `version` as a string
 * (`"11"`) while an endpoint may well answer with a number (`11`).
 *
 * A failed check counts as current: the version endpoint being unreachable is
 * a reason to keep working from the stored manifest, not to throw the list
 * away and then fail to replace it.
 *
 * @param storedVersion - `version` from the manifest in IndexedDB
 * @returns True when the stored manifest may still be used
 */
async function isStoredVersionCurrent(storedVersion: string): Promise<boolean> {
  try {
    const { version } = await verifyVersion();

    if (String(version) === String(storedVersion)) return true;

    console.log(`[manifest] Version changed: stored ${storedVersion} → registry ${version}`);
    return false;
  } catch (err) {
    console.warn("[manifest] Version check failed — keeping the stored manifest:", err);
    return true;
  }
}

/**
 * Get the signed mini-app manifest, preferring the copy in IndexedDB.
 *
 * The stored copy is used only when it passes two checks: its signature still
 * verifies, and its `version` still matches what {@link verifyVersion} reports.
 * Failing either one, it is deleted and the registry is called for a fresh
 * manifest, which is then stored in its place.
 *
 * Re-verifying the signature matters because IndexedDB is writable by anything
 * running on this origin — a cache hit has to clear the same bar as a fresh
 * download.
 *
 * @returns The verified, current manifest
 */
export async function fetchMiniApps(): Promise<SignedMiniAppManifest> {
  const stored = await getStoredMiniAppsManifest();

  if (stored?.manifest) {
    const usable = await (async () => {
      try {
        await assertManifestTrusted(stored.manifest, "cache");
      } catch {
        console.warn("[manifest] Stored manifest is untrusted — discarding");
        return false;
      }
      return isStoredVersionCurrent(stored.manifest.version);
    })();

    if (usable) {
      console.log("[manifest] Served from IndexedDB — no registry call");
      return stored.manifest;
    }

    await clearMiniAppsManifest();
  }

  return fetchManifestFromRegistry();
}

/**
 * Look up a single mini app in the verified manifest.
 *
 * @param manifest - A manifest already returned by {@link fetchMiniApps}
 * @param miniAppId - The mini app to find
 * @returns The mini app entry, or null when the manifest does not list it
 */
export function findMiniApp(
  manifest: SignedMiniAppManifest | undefined,
  miniAppId: string,
): ModuleManifest | null {
  return manifest?.miniApps.find((app: any) => app.miniAppId === miniAppId) ?? null;
}

/**
 * Resolve the URL the browser should actually download a bundle from.
 *
 * Object storage serving the archives sends no CORS headers, so by default the
 * download goes through the shell's own proxy route. Set
 * `NEXT_PUBLIC_BUNDLE_PROXY=off` once the bucket allows this origin directly.
 *
 * Either way the client hashes what it receives against the manifest's
 * `bundleHash`, so the path the bytes travel does not affect their integrity.
 *
 * @param bundleUrl - The `bundleUrl` exactly as published in the manifest
 * @returns URL to fetch the archive from
 */
export function bundleFetchUrl(bundleUrl: string): string {
  if (process.env.NEXT_PUBLIC_BUNDLE_PROXY === "off") return bundleUrl;
  return `/api/manifests/bundle?url=${encodeURIComponent(bundleUrl)}`;
}

export function getFallbackManifests(): OldModuleManifest[] {
  return FALLBACK_MINI_APPS;
}

export async function fetchOldMiniApp(id: string): Promise<OldModuleManifest | null> {
  return FALLBACK_MINI_APPS.find((m) => m.id === id) ?? null;
}
