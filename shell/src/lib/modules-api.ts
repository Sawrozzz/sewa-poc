import type { ModuleManifest, OldModuleManifest, SignedMiniAppManifest } from "@sewa/host-platform";
import axios from "axios";
import { isSignatureEnforced, verifyManifestSignature } from "./manifest-signature";
import { FALLBACK_MINI_APPS } from "./mock-mini-apps";

/**
 * Fetch the registry's signed mini-app manifest and verify it.
 *
 * The manifest is only handed back once its RSA signature checks out against
 * the registry's public key — nothing downstream ever sees an unverified list.
 * Set `NEXT_PUBLIC_MANIFEST_SIGNATURE_REQUIRED=false` to downgrade a failed
 * check to a console warning while the registry's key pair is being sorted out.
 */
export async function fetchMiniApps(): Promise<SignedMiniAppManifest> {
  const response = await axios.get<SignedMiniAppManifest>("/api/mini-apps");
  const manifest = response.data;

  const { valid, reason } = await verifyManifestSignature(manifest);
  if (!valid) {
    console.error("[manifest] Signature verification FAILED:", reason);
    if (isSignatureEnforced()) {
      throw new Error(`Manifest signature verification failed — ${reason}`);
    }
    console.warn("[manifest] Signature enforcement is disabled — showing unverified mini apps");
  } else {
    console.log("[manifest] Signature verified with key:", manifest.keyId);
  }

  return manifest;
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
  return manifest?.miniApps.find((app:any) => app.miniAppId === miniAppId) ?? null;
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
  return `/api/mini-apps/bundle?url=${encodeURIComponent(bundleUrl)}`;
}

export function getFallbackManifests(): OldModuleManifest[] {
  return FALLBACK_MINI_APPS;
}

export async function fetchOldMiniApp(id: string): Promise<OldModuleManifest | null> {
  return FALLBACK_MINI_APPS.find((m) => m.id === id) ?? null;
}
