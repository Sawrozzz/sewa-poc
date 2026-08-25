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
const FETCH_TIMEOUT_MS = 15000;

function registryUrl(path: string): string {
  if (!REGISTRY_BASE_URL?.trim()) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured — cannot reach the manifest registry.");
  }
  try {
    return new URL(
      path.replace(/^\/+/, ""),
      `${REGISTRY_BASE_URL.trim().replace(/\/+$/, "")}/`,
    ).toString();
  } catch {
    throw new Error(`Invalid registry URL for path: ${path}`);
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Registry responded with ${response.status} for ${url}`);
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error(`Registry returned invalid JSON for ${url}`);
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError")
      throw new Error(`Registry request timed out: ${url}`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSignedManifest(): Promise<SignedMiniAppManifest> {
  return fetchJson<SignedMiniAppManifest>(registryUrl(REGISTRY_MANIFEST_PATH));
}
export async function postTogetSignedManifest(): Promise<SignedMiniAppManifest> {
  return fetchJson<SignedMiniAppManifest>(registryUrl(POST_TO_GET_REGISTRY_MANIFEST_PATH), {
    method: "POST",
  });
}

export async function getManifestVersion(): Promise<ManifestVersion> {
  return fetchJson<ManifestVersion>(registryUrl(MANIFEST_VERSION_PATH));
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
  const MAX_PAGE_SIZE = 100;
  const size =
    params.size != null ? Math.min(Math.max(1, Number(params.size)), MAX_PAGE_SIZE) : undefined;
  const query = new URLSearchParams();
  if (size != null) query.set("size", String(size));
  if (params.orderBy) query.set("orderBy", params.orderBy);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.searchBy) query.set("searchBy", params.searchBy);
  if (params.search) query.set("search", params.search);

  const queryString = query.toString();
  const path = queryString ? `${MANIFEST_MINI_APPS_PATH}?${queryString}` : MANIFEST_MINI_APPS_PATH;
  return fetchJson<PaginatedMiniApps>(registryUrl(path));
}
