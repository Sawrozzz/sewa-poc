import type { ModuleManifest, OldModuleManifest, SignedMiniAppManifest } from "@sewa/host-platform";
import axios from "axios";
import { FALLBACK_MINI_APPS } from "@/core/mocks/mock-mini-apps";
import {
  clearMiniAppsManifest,
  getStoredMiniAppsManifest,
  saveMiniAppsManifest,
} from "@/core/storage/index-db";
import type {
  ManifestVersion,
  MiniAppListItem,
  PaginatedMiniAppParamsType,
  PaginatedMiniApps,
} from "@/types/manifest";
import { isSignatureEnforced, verifyManifestSignature } from "./manifest-signature";

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
  const response = await axios.get<SignedMiniAppManifest>("/api/manifests", { timeout: 15000 });
  const manifest = response.data;
  if (!manifest || typeof manifest.id !== "string" || !Array.isArray(manifest.miniApps)) {
    throw new Error("Invalid manifest shape from registry");
  }
  await assertManifestTrusted(manifest, "registry");
  try {
    await saveMiniAppsManifest(manifest);
  } catch (err) {
    console.warn("[manifest] Failed to persist manifest:", err);
  }
  return manifest;
}

export async function verifyVersionUpdate(): Promise<ManifestVersion> {
  const response = await axios.get<ManifestVersion>("/api/manifest-version", { timeout: 10000 });
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
    let trusted = true;
    try {
      await assertManifestTrusted(stored.manifest, "cache");
    } catch {
      console.warn("[manifest] Stored manifest untrusted — discarding");
      trusted = false;
    }
    if (trusted && (await isStoredVersionCurrent(stored.manifest.id))) return stored.manifest;
    await clearMiniAppsManifest().catch(() => {});
  }
  return fetchManifestFromRegistry();
}

export const MINI_APP_PAGE_SIZE = 10;

export async function fetchMiniAppCatalog(
  params: Partial<PaginatedMiniAppParamsType> = {},
): Promise<PaginatedMiniApps> {
  const response = await axios.get<PaginatedMiniApps>("/api/mini-apps", {
    timeout: 15000,
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
  if (!bundleUrl || typeof bundleUrl !== "string") throw new Error("bundleUrl is required");
  try {
    const u = new URL(bundleUrl);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error("Unsupported protocol");
  } catch (err) {
    throw new Error(`Invalid bundleUrl: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (process.env.NEXT_PUBLIC_BUNDLE_PROXY === "off") return bundleUrl;
  return `/api/manifests/bundle?url=${encodeURIComponent(bundleUrl)}`;
}

export function getFallbackManifests(): OldModuleManifest[] {
  return FALLBACK_MINI_APPS;
}

export async function fetchOldMiniApp(id: string): Promise<OldModuleManifest | null> {
  return FALLBACK_MINI_APPS.find((m) => m.id === id) ?? null;
}
