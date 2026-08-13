import type { SignedMiniAppManifest } from "@sewa/host-platform";

/**
 * Server-side source of the registry's signed mini-app manifest.
 *
 * Kept out of the route handler so the bundle proxy can read the same document
 * and refuse to fetch any URL the manifest does not vouch for.
 *
 * This runs on the server, so it must talk to the registry directly — going
 * back through the shell's own `/api/mini-apps` route would need an absolute
 * URL and would just make the server call itself.
 */
const REGISTRY_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const REGISTRY_MANIFEST_PATH = "manifest-registry/registry/manifests/registry";

/**
 * Read the current signed manifest from the registry.
 *
 * @returns The manifest exactly as it will be handed to the client, signature
 *   included — the shell verifies it there, not here.
 * @throws When the registry URL is unconfigured or the registry does not answer
 *   with a manifest
 */
export async function getSignedManifest(): Promise<SignedMiniAppManifest> {
  if (!REGISTRY_BASE_URL?.trim()) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured — cannot reach the manifest registry.");
  }

  const url = `${REGISTRY_BASE_URL.trim().replace(/\/+$/, "")}/${REGISTRY_MANIFEST_PATH}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Manifest registry responded with ${response.status}.`);
  }

  return (await response.json()) as SignedMiniAppManifest;
}
