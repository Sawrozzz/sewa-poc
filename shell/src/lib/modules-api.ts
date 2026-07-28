import axios from "axios";
import type { ModuleManifest } from "@sewa/platform-contracts";

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
    color: (app.metadata?.color as string) ?? "#007bc8",
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
    id: "chat-mini-app",
    name: "Chat App",
    description: "A reliable chat application for instant answers.",
    vendor: "ai-chat-machine",
    version: "2.1.0",
    sdkVersion: "1.0.0",
    icon: "🤖",
    color: "#007bc8",
    category: "Chat",
    route: "/mini-app/chat-mini-app",
    requiredPermissions: [],
    capabilities: [
      "auth",
      "chat",
      "ai",
      "permissions",
      "flags",
      "config",
      "navigation",
      "telemetry",
      "platform",
      "device",
      "http",
      "events",
    ],
    isEnabled: true,
    order: 1,
    bundleUrl: "http://localhost:3009/",
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
    name: "Vue Mini App",
    description: "A mini app built on Vue..",
    vendor: "veu-app",
    version: "2.1.0",
    sdkVersion: "1.0.0",
    icon: "💼",
    color: "#007bc8",
    category: "Chat",
    route: "/mini-app/vue-mini-app",
    requiredPermissions: [],
    capabilities: [
      "auth",
      "chat",
      "ai",
      "permissions",
      "flags",
      "config",
      "navigation",
      "telemetry",
      "platform",
      "device",
      "http",
      "events",
    ],
    isEnabled: true,
    order: 1,
    bundleUrl:"https://vue-mini-app-eta.vercel.app/",
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
  {
    id: "revenue-mini-app",
    name: "Revenue Mini App",
    description: "A mini app built on Revenue..",
    vendor: "veu-app",
    version: "2.1.0",
    sdkVersion: "1.0.0",
    icon: "💼",
    color: "#007bc8",
    category: "Chat",
    route: "/mini-app/revenue",
    requiredPermissions: [],
    capabilities: [
      "auth",
      "chat",
      "ai",
      "permissions",
      "flags",
      "config",
      "navigation",
      "telemetry",
      "platform",
      "device",
      "http",
      "events",
    ],
    isEnabled: true,
    order: 1,
    bundleUrl: "https://mini-revenue-app.vercel.app/",
    // bundleUrl: "http://localhost:3008/",
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
  {
    id: "test-mini-app",
    name: "Test Mini App",
    description: "This mini app contain all the basic operations that can be perform thorough any mini app.",
    vendor: "Sawroz",
    version: "2.1.0",
    sdkVersion: "1.0.0",
    icon: "💼",
    color: "#007bc8",
    category: "Test",
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
      "telemetry",
      "platform",
      "device",
      "http",
      "events",
    ],
    isEnabled: true,
    order: 1,
    bundleUrl: "http://localhost:3002/",
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
];

export async function fetchMiniApps(): Promise<ModuleManifest[]> {
  try {
    const res = await axios.get<MiniAppRecord[]>("/api/mini-apps");
    return res.data.map(toManifest);
  } catch {
    return FALLBACK_MANIFESTS;
  }
}

export async function fetchMiniApp(id: string): Promise<ModuleManifest | null> {
  const manifests = await fetchMiniApps();
  return manifests.find((m) => m.id === id) ?? null;
}
