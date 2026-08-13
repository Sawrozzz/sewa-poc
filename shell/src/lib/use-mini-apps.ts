"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { clearMiniAppsManifest } from "./index-db";
import { fetchMiniApps, fetchOldMiniApp, findMiniApp, getFallbackManifests } from "./modules-api";

const MINI_APPS_KEY = ["mini-apps"] as const;

/**
 * Drop the stored manifest and pull a fresh one from the registry.
 *
 * `fetchMiniApps` answers from IndexedDB whenever a manifest is stored, so a
 * plain `refetch()` would just re-read the same copy. Clearing first is what
 * makes the next fetch actually hit the network.
 *
 * @returns A callback that refreshes the mini-app list
 */
export function useRefreshMiniApps() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await clearMiniAppsManifest();
    await queryClient.invalidateQueries({ queryKey: MINI_APPS_KEY });
  }, [queryClient]);
}

export function useFallbackMiniApps() {
  return getFallbackManifests();
}

export function useMiniApps() {
  return useQuery({
    queryKey: MINI_APPS_KEY,
    queryFn: fetchMiniApps,
    retry: 1,
  });
}

export function useMiniApp(id: string | null) {
  return useQuery({
    queryKey: [...MINI_APPS_KEY, id],
    // biome-ignore lint/style/noNonNullAssertion: <fix this later>
    queryFn: () => fetchOldMiniApp(id!),
    enabled: !!id,
  });
}

/**
 * Resolve one mini app out of the registry's signed manifest.
 *
 * Shares the manifest query — and therefore its signature check — with
 * {@link useMiniApps}, so opening a mini app directly by URL still verifies
 * the manifest before anything is downloaded.
 */
export function useRegistryMiniApp(id: string | null) {
  return useQuery({
    queryKey: MINI_APPS_KEY,
    queryFn: fetchMiniApps,
    enabled: !!id,
    retry: 1,
    select: (manifest) => findMiniApp(manifest, id ?? ""),
  });
}
