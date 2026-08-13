"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMiniApps, fetchOldMiniApp, findMiniApp, getFallbackManifests } from "./modules-api";

const MINI_APPS_KEY = ["mini-apps"] as const;

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
