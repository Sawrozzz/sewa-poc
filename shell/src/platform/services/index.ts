import type { ChatMessage } from "@lizuz/mini-app-types";
import type {
  EventBus,
  ModuleManifest,
  NavigationRouterResult,
  NavigationState,
  NavigationTarget,
  OldModuleManifest,
  ShellAppearanceService,
} from "@sewa/host-platform";
import { PLATFORM_EVENTS } from "@sewa/host-platform";
import type { PlatformServicesConfig } from "@/types/platform";
import type { AppearanceController } from "../appearance-controller";
import { createDeviceService } from "./device";
import { createHttpService } from "./http";

export type { PlatformServicesConfig } from "@/types/platform";

type MiniAppManifest = ModuleManifest | OldModuleManifest;

let moduleManifestCache: Map<string, MiniAppManifest> = new Map();

export function setModuleManifestCache(manifests: MiniAppManifest[]): void {
  moduleManifestCache = new Map(manifests.map((m) => ["miniAppId" in m ? m.miniAppId : m.id, m]));
}

/**
 * How long the shell holds a back press waiting for the mini app's answer.
 * Generous enough for a busy main thread, short enough that a mini app which
 * never answers doesn't leave the user pressing back at a dead button.
 */
const BACK_ANSWER_TIMEOUT_MS = 700;

export function createShellServices(
  getConfig: () => PlatformServicesConfig,
  deps: { appearanceController?: AppearanceController; eventBus?: EventBus } = {},
) {
  const { appearanceController, eventBus } = deps;

  const appearance: ShellAppearanceService = appearanceController
    ? {
        getLocale: () => Promise.resolve(appearanceController.getLocale()),
        getTheme: () => Promise.resolve(appearanceController.getTheme()),
      }
    : nullAppearance;
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
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.gov.example",
    environment: process.env.NODE_ENV ?? "development",
    // No hardcoded locale — resolved from the appearance controller (host-driven).
    locale: appearanceController?.getLocale().locale ?? "en-LK",
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

  /**
   * Back-button handshake state.
   *
   * `miniAppCanGoBack` is whatever the mounted mini app last told us about
   * its own history — via `navigation.push` or its `navigation.route.changed`
   * event. It starts `false`, so a mini app that knows nothing about the
   * handshake (or hasn't navigated yet) never costs the user a round trip:
   * the shell just leaves, exactly as it did before.
   *
   * `pendingBack` is the press currently being held, waiting for an answer.
   */
  let miniAppCanGoBack = false;
  let pendingBack: {
    resolve: (consumed: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const canGoBackHandlers = new Set<(canGoBack: boolean) => void>();

  const setCanGoBack = (next: boolean) => {
    if (miniAppCanGoBack === next) return;
    miniAppCanGoBack = next;
    canGoBackHandlers.forEach((handler) => {
      handler(next);
    });
  };

  const settleBack = (consumed: boolean) => {
    if (!pendingBack) return;
    clearTimeout(pendingBack.timer);
    const { resolve } = pendingBack;
    pendingBack = null;
    resolve(consumed);
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
          : `/mini-app/${target.app}${target.route === "/" ? "" : target.route}`,
      );
      navigationHandlers.forEach((h) => {
        h(navigationState);
      });
    },
    getCurrent: () => navigationState,
    onNavigate: (handler: (state: NavigationState) => void) => {
      navigationHandlers.add(handler);
      return () => navigationHandlers.delete(handler);
    },

    /** The mini app's answer to a held back press. */
    back: async (consumed: boolean): Promise<NavigationRouterResult> => {
      settleBack(consumed);
      // It just popped its last route, so the next press is the shell's.
      if (!consumed) setCanGoBack(false);
      return { consumed };
    },

    /** The mini app moved forward inside itself — it now has something to pop. */
    push: async (consumed: boolean): Promise<NavigationRouterResult> => {
      setCanGoBack(true);
      return { consumed };
    },

    requestBack: (): Promise<boolean> => {
      // Nothing to ask: no mini app has claimed history, so the press
      // belongs to the shell.
      if (!miniAppCanGoBack || !eventBus) return Promise.resolve(false);

      // A second press while one is still in flight — don't stack them.
      if (pendingBack) return Promise.resolve(true);

      const answered = new Promise<boolean>((resolve) => {
        pendingBack = {
          resolve,
          timer: setTimeout(() => {
            pendingBack = null;
            setCanGoBack(false);
            resolve(false);
          }, BACK_ANSWER_TIMEOUT_MS),
        };
      });

      void eventBus.emit(PLATFORM_EVENTS.NAVIGATION_BACK_REQUESTED, "shell", {
        requestId: `back-${Date.now()}`,
      });

      return answered;
    },

    hasPendingBack: () => pendingBack !== null,
    canGoBack: () => miniAppCanGoBack,
    setCanGoBack,
    onCanGoBackChange: (handler: (canGoBack: boolean) => void) => {
      canGoBackHandlers.add(handler);
      return () => canGoBackHandlers.delete(handler);
    },

    resetRouter: () => {
      settleBack(false);
      setCanGoBack(false);
    },
  };

  const { http, api, storage } = createHttpService();
  const device = createDeviceService(() => getConfig().getUser());

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
              } catch {
                /* skip */
              }
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
            } catch {
              /* skip */
            }
          }
        }
      } catch (err) {
        console.error("[chat] error:", err instanceof Error ? err.message : err);
        yield "[error fetching reply]";
      }
    },
  };

  const getManifestKey = (manifest: MiniAppManifest): string =>
    "miniAppId" in manifest ? manifest.miniAppId : manifest.id;

  const moduleManifest = {
    get: (moduleId: string) => moduleManifestCache.get(moduleId),
    getAll: () => moduleManifestCache,
    getKey: getManifestKey,
  };

  return {
    auth,
    permissions,
    flags,
    config,
    navigation,
    chat,
    device,
    storage,
    api,
    http,
    appearance,
    moduleManifest,
  };
}

const nullAppearance: ShellAppearanceService = {
  getLocale: () => Promise.resolve({ locale: "en-LK", language: "en", direction: "ltr" }),
  getTheme: () => Promise.resolve({ preference: "system", mode: "light" }),
};
