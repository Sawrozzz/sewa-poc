import axios from "axios";
import type { ModuleManifest, OldModuleManifest, MiniAppRecord } from "@sewa/host-platform";
import { FALLBACK_MINI_APPS } from "./mock-mini-apps";


export async function fetchMiniApps(): Promise<MiniAppRecord> {
  const response = await axios.get<MiniAppRecord>("/api/mini-apps");

  return response.data;
}


export function getFallbackManifests(): OldModuleManifest[] {
  return FALLBACK_MINI_APPS;
}

export async function  fetchOldMiniApp(id:string): Promise <OldModuleManifest | null> {
  return FALLBACK_MINI_APPS.find((m) => m.id === id) ?? null
}

