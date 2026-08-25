"use client";

import type { ModuleManifest } from "@sewa/host-platform";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import type { ResolvedMiniApp } from "@/core/manifest/merge-mini-app";
import { indexManifestMiniApps, mergeMiniApp } from "@/core/manifest/merge-mini-app";
import {
  fetchCatalogRow,
  fetchMiniAppCatalog,
  fetchMiniApps,
  fetchOldMiniApp,
  findMiniApp,
  getFallbackManifests,
  MINI_APP_PAGE_SIZE,
} from "@/core/manifest/modules-api";
import { clearMiniAppsManifest } from "@/core/storage/index-db";
import type {
  MiniAppListItem,
  PaginatedMiniAppParamsType,
  PaginatedMiniApps,
} from "@/types/manifest";

const MANIFEST_KEY = ["mini-apps", "manifest"] as const;
const CATALOG_KEY = ["mini-apps", "catalog"] as const;

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

export type MiniAppCatalogOptions = Partial<Omit<PaginatedMiniAppParamsType, "cursor">>;

export function useMiniAppCatalog(options: MiniAppCatalogOptions = {}) {
  const { size = MINI_APP_PAGE_SIZE, orderBy = "DESC", sortBy = "id", search, searchBy } = options;

  const manifestQuery = useMiniApps();
  const manifestEntries = useMemo(
    () => indexManifestMiniApps(manifestQuery.data?.miniApps),
    [manifestQuery.data],
  );

  const query = useInfiniteQuery({
    queryKey: [...CATALOG_KEY, { size, orderBy, sortBy, search, searchBy }] as const,
    queryFn: ({ pageParam }) =>
      fetchMiniAppCatalog({ size, orderBy, sortBy, search, searchBy, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    // `nextCursor` keeps its last value once the list is exhausted, so
    // `hasNextPage` is what decides whether to ask for more.
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? (lastPage.meta.nextCursor ?? undefined) : undefined,
    // The catalog is unusable without the manifest — every row is dropped, and
    // nothing here can be opened — so it is not worth fetching before the
    // manifest is in hand.
    enabled: !!manifestQuery.data,
    retry: 1,
  });

  const miniApps = useMemo<ResolvedMiniApp[]>(() => {
    const listed = query.data?.pages.flatMap((p) => p.data) ?? [];
    if (!manifestQuery.data) return [];
    const merged: ResolvedMiniApp[] = [];
    for (const app of listed) {
      const entry = manifestEntries.get(app.miniAppId);
      if (entry) merged.push(mergeMiniApp(app, entry));
    }
    if (merged.length !== listed.length)
      console.log(
        `[catalog] Hid ${listed.length - merged.length}/${listed.length} not in manifest`,
      );
    return merged;
  }, [query.data, manifestQuery.data, manifestEntries]);

  // A page can filter down to nothing — the catalog is paginated before it is
  // matched, so ten unmatched entries come back as an empty screen. Pull the
  // next page until something matches or the list runs out, otherwise the grid
  // reads as "no services" while later pages still hold matches.
  const { fetchNextPage, hasNextPage, isFetching } = query;
  useEffect(() => {
    if (!manifestQuery.data) return;
    if (miniApps.length > 0 || isFetching || !hasNextPage) return;
    void fetchNextPage().catch((err) => console.warn("[catalog] fetchNextPage failed:", err));
  }, [manifestQuery.data, miniApps.length, isFetching, hasNextPage, fetchNextPage]);

  const isError = query.isError || manifestQuery.isError;

  return {
    ...query,
    miniApps,
    // The manifest is part of loading this list now, not just of opening an app.
    // Skipping past fully-unmatched pages counts as loading too — otherwise the
    // empty state shows between those fetches.
    //
    // A failure ends the loading state even though the catalog query is still
    // `pending`: it stays disabled until the manifest resolves, so a manifest
    // that errored would otherwise leave the callers — which check `isLoading`
    // before `isError` — showing skeletons over an error that never clears.
    isLoading:
      !isError &&
      (query.isLoading ||
        manifestQuery.isLoading ||
        (miniApps.length === 0 && query.isFetchingNextPage)),
    isError,
    error: manifestQuery.error ?? query.error,
  };
}

export function useMiniApp(id: string | null) {
  return useQuery({
    queryKey: [...MANIFEST_KEY, "fallback", id],
    queryFn: () => {
      if (!id) throw new Error("miniApp id is required");
      return fetchOldMiniApp(id);
    },
    enabled: !!id,
  });
}

/**
 * Find a mini app's catalog row in whatever catalog pages are already cached.
 *
 * Read from the cache rather than fetched: the catalog is cursor-paginated, so
 * looking a single `miniAppId` up would mean paging through the list, and the
 * row carries nothing the mini app needs in order to load.
 *
 * @param queryClient - The client holding the catalog pages
 * @param miniAppId - The mini app to look for
 * @returns The cached row, or undefined when no loaded page holds it
 */
function cachedCatalogRow(
  queryClient: QueryClient,
  miniAppId: string,
): MiniAppListItem | undefined {
  const cached = queryClient.getQueriesData<InfiniteData<PaginatedMiniApps>>({
    queryKey: CATALOG_KEY,
  });

  for (const [, data] of cached) {
    const row = data?.pages.flatMap((page) => page.data).find((app) => app.miniAppId === miniAppId);

    if (row) return row;
  }

  return undefined;
}

/**
 * Resolve one mini app out of the registry's signed manifest, merged with its
 * catalog row.
 *
 * This is how a card click becomes a load: the signed manifest supplies the
 * `bundleUrl` and `bundleHash` that the download-verify-unzip path needs, and
 * the catalog row supplies the display fields and — until the registry signs
 * them — `capabilities`. Shares the manifest query, and therefore its signature
 * check and IndexedDB copy, with {@link useMiniApps}.
 *
 * The row is read from whatever catalog pages are cached and only fetched when
 * none of them hold it, which is the deep-link case: opening `/some-app` in a
 * fresh tab never renders the grid, so nothing would have loaded it.
 *
 * `isLoading` stays true until the row resolves, even though the bundle does
 * not depend on it. The container hands `capabilities` to the SDK handshake as
 * it loads, and a grant that arrived a moment later would be a grant the mini
 * app never got.
 */
export function useRegistryMiniApp(id: string | null) {
  const queryClient = useQueryClient();

  const manifestQuery = useQuery({
    queryKey: MANIFEST_KEY,
    queryFn: fetchMiniApps,
    enabled: !!id,
    retry: 1,
    select: (manifest) => findMiniApp(manifest, id ?? ""),
  });

  const entry = manifestQuery.data ?? null;

  const rowQuery = useQuery({
    queryKey: [...CATALOG_KEY, "row", id] as const,
    // `fetchCatalogRow` answers null rather than throwing, so a catalog that is
    // down degrades to the manifest entry instead of failing the load.
    queryFn: () => cachedCatalogRow(queryClient, id ?? "") ?? fetchCatalogRow(id ?? ""),
    enabled: !!id && !!entry,
    retry: 1,
  });

  const data = useMemo<ResolvedMiniApp | ModuleManifest | null>(() => {
    if (!entry) return null;
    return rowQuery.data ? mergeMiniApp(rowQuery.data, entry) : entry;
  }, [entry, rowQuery.data]);

  return {
    ...manifestQuery,
    data,
    isLoading: manifestQuery.isLoading || (!!entry && rowQuery.isPending),
  };
}
