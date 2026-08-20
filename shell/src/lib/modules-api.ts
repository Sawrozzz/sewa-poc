import type { ModuleManifest, OldModuleManifest, SignedMiniAppManifest } from "@sewa/host-platform";
import axios from "axios";
import type {
  ManifestVersion,
  MiniAppListItem,
  PaginatedMiniAppParamsType,
  PaginatedMiniApps,
} from "@/types/manifest";
import { clearMiniAppsManifest, getStoredMiniAppsManifest, saveMiniAppsManifest } from "./index-db";
import { isSignatureEnforced, verifyManifestSignature } from "./manifest-signature";
import { FALLBACK_MINI_APPS } from "./mock-mini-apps";

async function assertManifestTrusted(
  manifest: SignedMiniAppManifest,
  origin: "registry" | "cache",
): Promise<boolean> {
  const { valid, reason } = await verifyManifestSignature(manifest);

  if (valid) {
    return true;
  }

  console.error(`[manifest] Signature verification FAILED (${origin}):`, reason);
  if (isSignatureEnforced()) {
    throw new Error(`Manifest signature verification failed — ${reason}`);
  }
  console.warn("[manifest] Signature enforcement is disabled — showing unverified mini apps");
  return true;
}

async function fetchManifestFromRegistry(): Promise<SignedMiniAppManifest> {
  const response = await axios.get<SignedMiniAppManifest>("/api/manifests");
  const manifest = response.data;

  await assertManifestTrusted(manifest, "registry");
  await saveMiniAppsManifest(manifest);

  return manifest;
}

export async function verifyVersionUpdate(): Promise<ManifestVersion> {
  const response = await axios.get<ManifestVersion>("/api/manifest-version");
  return response.data;
}

async function isStoredVersionCurrent(storedId: string): Promise<boolean> {
  try {
    const published = await verifyVersionUpdate();

    // The endpoint answers `{ "id": "<uuid>" }` — the id of the manifest the
    // registry currently publishes, which is the same value the stored
    // manifest carries as `manifest.id`. `version` is only read as a fallback,
    // for a registry that later starts naming the field that way.
    const current = published.id ?? published.version;

    if (current === undefined) {
      // Nothing comparable came back, so every check counts as a miss: the
      // stored manifest is dropped and re-downloaded on each call and the
      // IndexedDB copy is never reused. Loud on purpose — that is a broken
      // version endpoint, not a manifest that keeps changing.
      console.warn(
        "[manifest] Version endpoint returned neither `id` nor `version` — the stored manifest cannot be reused:",
        published,
      );
      return false;
    }

    return String(current) === String(storedId);
  } catch (err) {
    console.warn("[manifest] Version check failed — keeping the stored manifest:", err);
    return true;
  }
}

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
      return isStoredVersionCurrent(stored.manifest.id);
    })();

    if (usable) {
      return stored.manifest;
    }

    await clearMiniAppsManifest();
  }

  return fetchManifestFromRegistry();
}

export const MINI_APP_PAGE_SIZE = 10;

export async function fetchMiniAppCatalog(
  params: Partial<PaginatedMiniAppParamsType> = {},
): Promise<PaginatedMiniApps> {
  const response = await axios.get<PaginatedMiniApps>("/api/mini-apps", {
    params: {
      size: params.size ?? MINI_APP_PAGE_SIZE,
      orderBy: params.orderBy ?? "DESC",
      sortBy: params.sortBy ?? "id",
      cursor: params.cursor,
      searchBy: params.searchBy,
      search: params.search,
    },
  });

  return response.data;
}

export async function fetchCatalogRow(miniAppId: string): Promise<MiniAppListItem | null> {
  try {
    const page = await fetchMiniAppCatalog({ size: 1, searchBy: "miniAppId", search: miniAppId });
    return page.data.find((app) => app.miniAppId === miniAppId) ?? null;
  } catch (err) {
    console.warn(`[catalog] Could not read the catalog row for "${miniAppId}":`, err);
    return null;
  }
}

export function findMiniApp(
  manifest: SignedMiniAppManifest | undefined,
  miniAppId: string,
): ModuleManifest | null {
  return manifest?.miniApps.find((app: ModuleManifest) => app.miniAppId === miniAppId) ?? null;
}

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
