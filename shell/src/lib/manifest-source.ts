import type { SignedMiniAppManifest } from "@sewa/host-platform";
import type {
  ManifestVersion,
  PaginatedMiniAppParamsType,
  PaginatedMiniApps,
} from "@/types/manifest";

/**
 * Server-side source of the registry's signed mini-app manifest.
 *
 * Kept out of the route handler so the bundle proxy can read the same document
 * and refuse to fetch any URL the manifest does not vouch for.
 *
 * This runs on the server, so it must talk to the registry directly — going
 * back through the shell's own `/api/manifests` route would need an absolute
 * URL and would just make the server call itself.
 */
const REGISTRY_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const REGISTRY_MANIFEST_PATH = "manifest-registry/registry/manifests/registry";
const POST_TO_GET_REGISTRY_MANIFEST_PATH = "manifest-registry/registry/publish";
const MANIFEST_VERSION_PATH = "manifest-registry/registry/manifests/version";
const MANIFEST_MINI_APPS_PATH = "manifest-registry/registry/mini-apps";

/**
 * Build an absolute registry URL.
 *
 * Both the base and the path are normalized, so a `NEXT_PUBLIC_API_URL` with or
 * without a trailing slash produces the same URL.
 *
 * @param path - Registry path, without a leading slash
 * @returns The absolute URL to fetch
 * @throws When `NEXT_PUBLIC_API_URL` is not configured
 */
function registryUrl(path: string): string {
  if (!REGISTRY_BASE_URL?.trim()) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured — cannot reach the manifest registry.");
  }

  return `${REGISTRY_BASE_URL.trim().replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function getSignedManifest(): Promise<SignedMiniAppManifest> {
  const response = await fetch(registryUrl(REGISTRY_MANIFEST_PATH), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Manifest registry responded with ${response.status}.`);
  }

  return (await response.json()) as SignedMiniAppManifest;
}
export async function postTogetSignedManifest(): Promise<SignedMiniAppManifest> {
  const response = await fetch(registryUrl(POST_TO_GET_REGISTRY_MANIFEST_PATH) , { cache: "no-store", method: "POST" } );

  if (!response.ok) {
    throw new Error(`Manifest registry responded with ${response.status}.`);
  }

  return (await response.json()) as SignedMiniAppManifest;
}

export async function getManifestVersion(): Promise<ManifestVersion> {
  const response = await fetch(registryUrl(MANIFEST_VERSION_PATH), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Manifest version responded with ${response.status}.`);
  }

  return (await response.json()) as ManifestVersion;
}


/**
 * Read one page of the browsable mini-app catalog.
 *
 * Separate from {@link getSignedManifest}: this is the paginated list the
 * portal renders, and it carries no `bundleUrl` or `bundleHash`. Anything
 * actually loadable still has to come from the signed manifest.
 *
 * @param params - Cursor pagination and search parameters; blank ones are
 *   omitted so the registry applies its own defaults
 * @returns The page of mini apps plus its pagination metadata
 * @throws When the registry URL is unconfigured or the registry does not answer
 */
export async function getManifestMiniApps(
  params: Partial<PaginatedMiniAppParamsType> = {},
): Promise<PaginatedMiniApps> {
  const query = new URLSearchParams();
  if (params.size != null) query.set("size", String(params.size));
  if (params.orderBy) query.set("orderBy", params.orderBy);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.searchBy) query.set("searchBy", params.searchBy);
  if (params.search) query.set("search", params.search);

  const queryString = query.toString();
  const path = queryString ? `${MANIFEST_MINI_APPS_PATH}?${queryString}` : MANIFEST_MINI_APPS_PATH;

  const response = await fetch(registryUrl(path), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Manifest mini apps responded with ${response.status}.`);
  }

  return (await response.json()) as PaginatedMiniApps;
}
