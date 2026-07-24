"use client";

import { useQuery } from "@tanstack/react-query";
import type { ModuleManifest } from "@sewa/platform-contracts";
import { fetchMiniApps, fetchMiniApp } from "./modules-api";

const MINI_APPS_KEY = ["mini-apps"] as const;

export function useMiniApps() {
  return useQuery({
    queryKey: MINI_APPS_KEY,
    queryFn: fetchMiniApps,
  });
}

export function useMiniApp(id: string | null) {
  return useQuery({
    queryKey: [...MINI_APPS_KEY, id],
    queryFn: () => fetchMiniApp(id!),
    enabled: !!id,
  });
}
