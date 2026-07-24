import type {
  PlatformUser,
  NavigationTarget,
  NavigationState,
  TelemetryMetrics,
  TelemetryContext,
  ChatMessage,
  DeviceLocationResult,
  DeviceCameraResult,
  DeviceGalleryResult,
  DeviceFilesResult,
  DeviceBiometricResult,
  DeviceNotificationResult,
  DeviceNetworkResult,
  DeviceInfoResult,
  HttpResult,
} from "@sewa/platform-contracts";

export interface PlatformServicesConfig {
  getUser: () => PlatformUser | null;
  getAccessToken: () => string | null;
  logout: () => Promise<void>;
  navigate: (path: string) => void;
}

export function createShellServices(
  getConfig: () => PlatformServicesConfig,
): import("@sewa/platform-contracts").ShellServiceMap {
  let navigationState: NavigationState = {
    app: "shell",
    route: "/",
    params: {},
    historyLength: 1,
  };

  const navigationHandlers = new Set<(state: NavigationState) => void>();

  const auth = {
    getUser: () => Promise.resolve(getConfig().getUser()),
    isAuthenticated: () => Promise.resolve(getConfig().getUser() !== null),
    logout: () => getConfig().logout(),
  };

  const permissions = {
    has: (permission: string) => {
      const user = getConfig().getUser();
      return user?.permissions?.includes(permission) ?? false;
    },
    list: () => getConfig().getUser()?.permissions ?? [],
  };

  const defaultFlags: Record<string, boolean> = {
    "new-checkout": false,
    "beta-dashboard": true,
    "enhanced-navigation": true,
  };

  const moduleFlags: Record<string, Record<string, boolean>> = {
    "driving-license": { "digital-wallet": true },
    "revenue-license": { "bulk-payment": false },
    "chat-mini-app": { "chat-enabled": true },
  };

  const flags = {
    isEnabled: (flag: string, moduleId?: string) => {
      if (moduleId && moduleFlags[moduleId]?.[flag] !== undefined) {
        return moduleFlags[moduleId][flag];
      }
      return defaultFlags[flag] ?? false;
    },
    getAll: (moduleId?: string) => {
      const result = { ...defaultFlags };
      if (moduleId && moduleFlags[moduleId]) {
        Object.assign(result, moduleFlags[moduleId]);
      }
      return result;
    },
    refresh: async () => {},
  };

  const globalConfig: Record<string, unknown> = {
    apiBaseUrl:
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.gov.example",
    environment: process.env.NODE_ENV ?? "development",
    locale: "en-NP",
    currency: "NPR",
  };

  const moduleConfig: Record<string, Record<string, unknown>> = {
    "chat-mini-app": { exampleKey: "exampleValue" },
  };

  const config = {
    get: <T = unknown>(key: string, moduleId?: string): T | undefined => {
      if (moduleId && moduleConfig[moduleId]?.[key] !== undefined) {
        return moduleConfig[moduleId][key] as T;
      }
      return globalConfig[key] as T | undefined;
    },
    getAll: (moduleId?: string) => {
      const result = { ...globalConfig };
      if (moduleId && moduleConfig[moduleId]) {
        Object.assign(result, moduleConfig[moduleId]);
      }
      return result;
    },
  };

  const navigation = {
    navigate: async (target: NavigationTarget) => {
      navigationState = {
        app: target.app,
        route: target.route,
        params: target.params ?? {},
        historyLength: navigationState.historyLength + 1,
      };
      getConfig().navigate(
        target.app === "shell"
          ? target.route
          : `/mini-app/${target.app}${target.route === "/" ? "" : target.route}`
      );
      navigationHandlers.forEach((h) => h(navigationState));
    },
    getCurrent: () => navigationState,
    onNavigate: (handler: (state: NavigationState) => void) => {
      navigationHandlers.add(handler);
      return () => navigationHandlers.delete(handler);
    },
  };

  const metrics: TelemetryMetrics = {
    eventThroughput: 0,
    navigationLatencyMs: [],
    moduleLoadTimesMs: {},
    deviceInteractionCounts: {},
    errorCounts: {},
  };

  const telemetry = {
    log: (ctx: TelemetryContext, level: string, message: string, context?: Record<string, unknown>) => {
      if (process.env.NODE_ENV === "development") {
        console[level === "error" ? "error" : "log"](`[Telemetry:${level}]`, { message, ...context });
      }
      const modId = (ctx as any).moduleId as string | undefined;
      if (level === "error" && modId) {
        metrics.errorCounts[modId] = (metrics.errorCounts[modId] ?? 0) + 1;
      }
    },
    track: (ctx: TelemetryContext, event: string, properties?: Record<string, unknown>) => {
      metrics.eventThroughput++;
      if (process.env.NODE_ENV === "development") {
      }
    },
    error: (ctx: TelemetryContext, err: Error | string, context?: Record<string, unknown>) => {
      const message = err instanceof Error ? err.message : err;
      const modId = (ctx as any).moduleId as string | undefined;
      if (modId) {
        metrics.errorCounts[modId] = (metrics.errorCounts[modId] ?? 0) + 1;
      } else {
        metrics.errorCounts["shell"] = (metrics.errorCounts["shell"] ?? 0) + 1;
      }
      if (process.env.NODE_ENV === "development") {
        console.error("[Telemetry:error]", { message, ...context });
      }
    },
    getMetrics: () => metrics,
  };

  const chat = {
    chat: async function* (messages: ChatMessage[], _options?: Record<string, unknown>) {
      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const json = JSON.parse(jsonStr);
                const content = json.choices?.[0]?.delta?.content || "";
                if (content) yield content;
              } catch { /* skip */ }
            }
          }
        }

        if (buffer.startsWith("data: ")) {
          const jsonStr = buffer.slice(6).trim();
          if (jsonStr !== "[DONE]") {
            try {
              const json = JSON.parse(jsonStr);
              const content = json.choices?.[0]?.delta?.content || "";
              if (content) yield content;
            } catch { /* skip */ }
          }
        }
      } catch (err) {
        console.error("[chat] error:", err instanceof Error ? err.message : err);
        yield "[error fetching reply]";
      }
    },
  };

  const device = {
    location: async (_options?: { highAccuracy?: boolean; timeout?: number }) => {
      if (!navigator.geolocation) throw new Error("Geolocation not supported");
      return new Promise<DeviceLocationResult>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: new Date(pos.timestamp),
            // altitude: pos.coords.altitude ?? undefined,
          }),
          (err) => reject(err),
          { enableHighAccuracy: _options?.highAccuracy ?? false, timeout: _options?.timeout ?? 10000 }
        );
      });
    },
    camera: async (_options?: { facing?: "front" | "back" }) =>
      ({ url: "", mimeType: "", byteSize: 0,  fileName: ""}) as unknown as DeviceCameraResult,
    gallery: async (_options?: { maxCount?: number }) =>
      ({ files: [] }) as unknown as DeviceGalleryResult,
    files: async (_options?: { accept?: string[]; multiple?: boolean }) =>
      ({ files: [] }) as unknown as DeviceFilesResult,
    biometric: async (_options?: { reason?: string }) =>
      ({ success: false, method: "pin" }) as unknown as DeviceBiometricResult,
    notifications: async (_options?: { requestPermission?: boolean }) =>
      ({ granted: false }) as unknown as DeviceNotificationResult,
    network: async () => ({
      online: navigator.onLine,
      type: navigator.onLine ? "unknown" : "none",
    }) as unknown as DeviceNetworkResult,
    storage: {
      get: async (key: string) => { try { return localStorage.getItem(`gov:${key}`); } catch { return null; } },
      set: async (key: string, value: string) => { try { localStorage.setItem(`gov:${key}`, value); } catch { /* */ } },
      remove: async (key: string) => { try { localStorage.removeItem(`gov:${key}`); } catch { /* */ } },
    },
    info: async () => {
      const ua = navigator.userAgent;
      const isMobile = /Mobi|Android/i.test(ua);
      return {
        platform: isMobile ? (ua.includes("iPhone") ? "IOS" : "ANDROID") : "WEB",
        osVersion: "",
        appVersion: "1",
        deviceModel: ua,
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      } as unknown as DeviceInfoResult;
    },
  };

  const http = {
    get: async <T = unknown>(endpoint?: string, query?: Record<string, string>) => {
      try {
        const params = query ? new URLSearchParams(query).toString() : "";
        const res = await fetch(params ? `${endpoint ?? "/api"}?${params}` : endpoint ?? "/api");
        const data = await res.json();
        return { status: res.status, data: data as T, headers: {} } as unknown as HttpResult<T>;
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : "HTTP GET failed" } as unknown as HttpResult<T>;
      }
    },
    post: async <T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        return { status: res.status, data: data as T, headers: {} } as unknown as HttpResult<T>;
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : "HTTP POST failed" } as unknown as HttpResult<T>;
      }
    },
    put: async <T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        return { status: res.status, data: data as T, headers: {} } as unknown as HttpResult<T>;
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : "HTTP PUT failed" } as unknown as HttpResult<T>;
      }
    },
    patch: async <T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        return { status: res.status, data: data as T, headers: {} } as unknown as HttpResult<T>;
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : "HTTP PATCH failed" } as unknown as HttpResult<T>;
      }
    },
    delete: async <T = unknown>(endpoint?: string, headers?: Record<string, string>) => {
      try {
        const res = await fetch(endpoint ?? "/api", { method: "DELETE", headers });
        const data = await res.json();
        return { status: res.status, data: data as T, headers: {} } as unknown as HttpResult<T>;
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : "HTTP DELETE failed" } as unknown as HttpResult<T>;
      }
    },
  };

  return {
    auth,
    permissions,
    flags,
    config,
    navigation,
    telemetry,
    chat,
    device,
    http,
  };
}
