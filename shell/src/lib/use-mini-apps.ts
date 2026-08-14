"use client";

import type { SignedMiniAppManifest } from "@sewa/host-platform";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import type { MiniAppListItem, PaginatedMiniAppParamsType } from "@/types/manifest";
import { clearMiniAppsManifest } from "./index-db";
import {
  fetchMiniAppCatalog,
  fetchMiniApps,
  fetchOldMiniApp,
  findMiniApp,
  getFallbackManifests,
  MINI_APP_PAGE_SIZE,
} from "./modules-api";

/** The signed manifest — the trust anchor, and the only source of bundle URLs */
const MANIFEST_KEY = ["mini-apps", "manifest"] as const;
/** The browsable, paginated catalog */
const CATALOG_KEY = ["mini-apps", "catalog"] as const;

/**
 * Drop the stored manifest and pull a fresh one from the registry.
 *
 * `fetchMiniApps` answers from IndexedDB whenever a manifest is stored, so a
 * plain `refetch()` would just re-read the same copy. Clearing first is what
 * makes the next fetch actually hit the network. The catalog is invalidated
 * alongside it so the list and the manifest are refreshed together.
 *
 * @returns A callback that refreshes the mini-app list
 */
export function useRefreshMiniApps() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await clearMiniAppsManifest();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: MANIFEST_KEY }),
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY }),
    ]);
  }, [queryClient]);
}

export function useFallbackMiniApps() {
  return getFallbackManifests();
}

/**
 * The signed manifest, verified and cached in IndexedDB.
 *
 * Kept as its own query because it is what every registry mini app is resolved
 * against — the portal loads it once, and opening an app reads from it.
 */
export function useMiniApps() {
  return useQuery({
    queryKey: MANIFEST_KEY,
    queryFn: fetchMiniApps,
    retry: 1,
  });
}

/** Options accepted by {@link useMiniAppCatalog} */
export type MiniAppCatalogOptions = Partial<Omit<PaginatedMiniAppParamsType, "cursor">>;

/** Every `miniAppId` the signed manifest lists, as a set for O(1) lookups. */
function manifestMiniAppIds(manifest: SignedMiniAppManifest | undefined): Set<string> {
  return new Set(manifest?.miniApps.map((app) => app.miniAppId) ?? []);
}

/**
 * The paginated mini-app catalog, as an infinite (cursor) list.
 *
 * Pages are keyed by the query shape, so changing the search or ordering starts
 * a fresh list rather than appending to the old one.
 *
 * Each page is filtered against the signed manifest: an entry is kept only when
 * its `miniAppId` also appears in the manifest held in IndexedDB. The two lists
 * are published independently and drift apart — the catalog gets a new mini app
 * before the manifest is re-signed, or the manifest still carries one the
 * catalog has dropped — and an entry present in only one of them cannot be
 * opened, because {@link findMiniApp} would find no `bundleUrl` for it. Hiding
 * those keeps the grid to the apps that actually load.
 *
 * @param options - Page size, ordering and search
 * @returns The infinite query, plus `miniApps` — the loaded pages flattened and
 *   narrowed to the manifest
 */
export function useMiniAppCatalog(options: MiniAppCatalogOptions = {}) {
  const { size = MINI_APP_PAGE_SIZE, orderBy = "DESC", sortBy = "id", search, searchBy } = options;

  const manifestQuery = useMiniApps();
  const manifestIds = useMemo(() => manifestMiniAppIds(manifestQuery.data), [manifestQuery.data]);

  const query = useInfiniteQuery({
    queryKey: [...CATALOG_KEY, { size, orderBy, sortBy, search, searchBy }] as const,
    queryFn: ({ pageParam }) =>
      fetchMiniAppCatalog({ size, orderBy, sortBy, search, searchBy, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    // `nextCursor` keeps its last value once the list is exhausted, so
    // `hasNextPage` is what decides whether to ask for more.
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? (lastPage.meta.nextCursor ?? undefined) : undefined,
    retry: 1,
  });

  const miniApps = useMemo<MiniAppListItem[]>(() => {
    const listed = query.data?.pages.flatMap((page) => page.data) ?? [];

    // Nothing is shown until the manifest has resolved: rendering the raw page
    // first would flash cards that are about to disappear, and a manifest that
    // failed to load leaves nothing openable to show.
    if (!manifestQuery.data) return [];

    const matched = listed.filter((app) => manifestIds.has(app.miniAppId));

    if (matched.length !== listed.length) {
      console.log(
        `[catalog] Hid ${listed.length - matched.length} of ${listed.length} mini app(s) missing from the signed manifest`,
      );
    }

    return matched;
  }, [query.data, manifestQuery.data, manifestIds]);

  // A page can filter down to nothing — the catalog is paginated before it is
  // matched, so ten unmatched entries come back as an empty screen. Pull the
  // next page until something matches or the list runs out, otherwise the grid
  // reads as "no services" while later pages still hold matches.
  const { fetchNextPage, hasNextPage, isFetching } = query;
  useEffect(() => {
    if (!manifestQuery.data) return;
    if (miniApps.length > 0 || isFetching || !hasNextPage) return;

    fetchNextPage();
  }, [manifestQuery.data, miniApps.length, isFetching, hasNextPage, fetchNextPage]);

  return {
    ...query,
    miniApps,
    // The manifest is part of loading this list now, not just of opening an app.
    // Skipping past fully-unmatched pages counts as loading too — otherwise the
    // empty state shows between those fetches.
    isLoading:
      query.isLoading ||
      manifestQuery.isLoading ||
      (miniApps.length === 0 && query.isFetchingNextPage),
    isError: query.isError || manifestQuery.isError,
    error: manifestQuery.error ?? query.error,
  };
}

export function useMiniApp(id: string | null) {
  return useQuery({
    queryKey: [...MANIFEST_KEY, "fallback", id],
    // biome-ignore lint/style/noNonNullAssertion: <fix this later>
    queryFn: () => fetchOldMiniApp(id!),
    enabled: !!id,
  });
}

/**
 * Resolve one mini app out of the registry's signed manifest.
 *
 * This is how a card click becomes a load: the catalog gives the `miniAppId`,
 * and the entry matched here supplies the `bundleUrl` and `bundleHash` that the
 * download-verify-unzip path needs. Shares the manifest query — and therefore
 * its signature check and IndexedDB copy — with {@link useMiniApps}.
 */
export function useRegistryMiniApp(id: string | null) {
  return useQuery({
    queryKey: MANIFEST_KEY,
    queryFn: fetchMiniApps,
    enabled: !!id,
    retry: 1,
    select: (manifest) => findMiniApp(manifest, id ?? ""),
  });
}
