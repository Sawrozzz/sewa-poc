import { createDeviceService } from "./device";
import { createStorageService } from "./http";

import type { AppearanceController } from "../appearance-controller";
import type {PlatformServicesConfig} from "@/types/services";
import type {
  NavigationTarget,
  NavigationState,
  ShellAppearanceService,
} from "@sewa/host-platform";

export type { PlatformServicesConfig } from "@/types/services";

export function createShellServices(
  getConfig: () => PlatformServicesConfig,
  deps: { appearanceController?: AppearanceController } = {},
) {
  const { appearanceController } = deps;

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
    apiBaseUrl:
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.gov.example",
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
      navigationHandlers.forEach((h) => h(navigationState));
    },
    getCurrent: () => navigationState,
    onNavigate: (handler: (state: NavigationState) => void) => {
      navigationHandlers.add(handler);
      return () => navigationHandlers.delete(handler);
    },
  };

  const { storage } = createStorageService();
  const device = createDeviceService(() => getConfig().getUser());

  return {
    auth,
    permissions,
    flags,
    config,
    navigation,
    device,
    storage,
    appearance,
  };
}

const nullAppearance: ShellAppearanceService = {
  getLocale: () => Promise.resolve({ locale: "en-LK", language: "en", direction: "ltr" }),
  getTheme: () => Promise.resolve({ preference: "system", mode: "light" }),
};
