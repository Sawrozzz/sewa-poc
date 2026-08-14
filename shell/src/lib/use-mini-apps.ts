"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
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

/**
 * The paginated mini-app catalog, as an infinite (cursor) list.
 *
 * Pages are keyed by the query shape, so changing the search or ordering starts
 * a fresh list rather than appending to the old one.
 *
 * @param options - Page size, ordering and search
 * @returns The infinite query, plus `miniApps` flattened across all loaded pages
 */
export function useMiniAppCatalog(options: MiniAppCatalogOptions = {}) {
  const { size = MINI_APP_PAGE_SIZE, orderBy = "DESC", sortBy = "id", search, searchBy } = options;

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

  const miniApps = useMemo<MiniAppListItem[]>(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );

  return { ...query, miniApps };
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
