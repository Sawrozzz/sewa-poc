import axios from "axios";
import type { ModuleManifest } from "@sewa/host-platform";

interface MiniAppRecord {
  miniAppId: string;
  miniAppName: string;
  pluginBaseUrl: string;
  pluginBackendUrl: string;
  healthEndpoint: string;
  capabilities: string[];
  metadata: Record<string, unknown>;
}

function toManifest(app: MiniAppRecord): ModuleManifest {
  return {
    id: app.miniAppId,
    name: app.miniAppName,
    description: "",
    vendor: (app.metadata?.vendor as string) ?? "default-vendor",
    version: (app.metadata?.version as string) ?? "1.0.0",
    sdkVersion: "1.0.0",
    icon: (app.metadata?.icon as string) ?? "📦",
    color: (app.metadata?.color as string) ?? "#dc9a0d",
    category: (app.metadata?.category as string) ?? "General",
    route: `/mini-app/${app.miniAppId}`,
    requiredPermissions: [],
    isEnabled: true,
    order: 0,
    bundleUrl: `${app.pluginBaseUrl}/`,
    entryType: "framework-agnostic",
    loadStrategy: "plugin",
    compatibility: {
      minShellVersion: "1.0.0",
      minSdkVersion: "1.0.0",
      supportedPlatforms: ["WEB"],
      supportedFrameworks: ["react"],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const FALLBACK_MANIFESTS: ModuleManifest[] = [
  {
    id: "test-mini-app",
    name: "Test Mini App",
    description: "This mini app contain all the basic operations that can be perform thorough any mini app.",
    vendor: "Sawroz",
    version: "2.1.0",
    sdkVersion: "1.0.0",
    icon: "🎯",
    color: "#dc9a0d",
    category: "Playground",
    route: "/mini-app/test",
    requiredPermissions: [],
    capabilities: [
      "auth",
      "chat",
      "ai",
      "permissions",
      "flags",
      "config",
      "navigation",
      "platform",
      "device",
      "api",
      "storage",
      "http",
      "events",
    ],
    isEnabled: true,
    order: 1,
    bundleUrl: "https://test-mini-app-orcin.vercel.app/",
    // bundleUrl: "http://localhost:3002/",
    entryType: "framework-agnostic",
    loadStrategy: "plugin",
    compatibility: {
      minShellVersion: "1.0.0",
      minSdkVersion: "1.0.0",
      supportedPlatforms: ["WEB"],
      supportedFrameworks: ["react"],
    },
    createdAt: "2025-01-15T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
  },
  {
    id: "veu-mini-app",
    name: "Veu Mini App",
    description: "This mini app in veu framework contain all the basic operations that can be perform thorough any mini app.",
    vendor: "Sawroz",
    version: "2.1.0",
    sdkVersion: "1.0.0",
    icon: "🟢",
    color: "#dc9a0d",
    category: "Playground",
    route: "/mini-app/veu-mini-app",
    requiredPermissions: [],
    capabilities: [
      "auth",
      "chat",
      "ai",
      "permissions",
      "flags",
      "config",
      "navigation",
      "platform",
      "device",
      "api",
      "storage",
      "http",
      "events",
    ],
    isEnabled: true,
    order: 1,
    bundleUrl: "https://vue-mini-app-eta.vercel.app/",
    // bundleUrl: "http://localhost:4000/",
    entryType: "framework-agnostic",
    loadStrategy: "plugin",
    compatibility: {
      minShellVersion: "1.0.0",
      minSdkVersion: "1.0.0",
      supportedPlatforms: ["WEB"],
      supportedFrameworks: ["vue"],
    },
    createdAt: "2025-01-15T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
  },
];

export async function fetchMiniApps(): Promise<ModuleManifest[]> {
  const res = await axios.get<MiniAppRecord[]>("/api/mini-apps");

  console.log("Response in mini app", res)

  console.log("Res", res?.data)
  // return res.data.map(toManifest);
  return Array.isArray(res.data) ? res.data.map(toManifest) : FALLBACK_MANIFESTS;
}

export async function fetchMiniApp(id: string): Promise<ModuleManifest | null> {
  try {
    const manifests = await fetchMiniApps();
    return manifests.find((m) => m.id === id) ?? null;
  } catch {
    return FALLBACK_MANIFESTS.find((m) => m.id === id) ?? null;
  }
}

export function getFallbackManifests(): ModuleManifest[] {
  return FALLBACK_MANIFESTS;
}
