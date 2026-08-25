"use client";

import type { EventBus, HostPlatformHandle, ShellServiceMap } from "@sewa/host-platform";
import { createEventBus, createHostPlatform, PostMessageTransport } from "@sewa/host-platform";
import type { RuntimeLoader } from "@sewa/runtime-loader";
import { createRuntimeLoader } from "@sewa/runtime-loader";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { AppearanceController } from "@/platform/appearance-controller";
import { createAppearanceController } from "@/platform/appearance-controller";
import { installHostApiGuard } from "@/platform/host-guard";
import { scheduleSdkWarm } from "@/platform/sdk";
import type { PlatformServicesConfig } from "../platform/services";
import { createShellServices } from "../platform/services";

export interface PlatformContextValue {
  eventBus: EventBus;
  communicator: HostPlatformHandle;
  loader: RuntimeLoader;
  services: ShellServiceMap;
  appearance: AppearanceController;
  isReady: boolean;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export interface PlatformProviderProps {
  children: ReactNode;
  authConfig: PlatformServicesConfig;
}

/**
 * Platform Provider — bootstraps all shell platform subsystems.
 *
 * Owns: Event Bus, Shell Communicator, Runtime Loader
 */
export function PlatformProvider({ children, authConfig }: PlatformProviderProps) {
  const platformRef = useRef<PlatformContextValue | null>(null);
  const authConfigRef = useRef(authConfig);
  const [platform, setPlatform] = useState<PlatformContextValue | null>(null);

  useEffect(() => {
    authConfigRef.current = authConfig;
  }, [authConfig]);

  useEffect(() => {
    if (platformRef.current) return;

    let cancelled = false;

    let cleanupInterval: ReturnType<typeof setInterval>;
    let cancelSdkWarm: (() => void) | undefined;

    async function init() {
      // Block sensitive browser APIs before any mini-app code runs
      installHostApiGuard();

      const eventBus = createEventBus({
        enableTracing: process.env.NODE_ENV === "development",
        onError: (err, event) => {
          console.error("[EventBus] Handler error:", err.message, event.type);
        },
      });

      // Host-driven appearance: owns locale/theme/tokens/shell catalog. Created
      // before services so config.locale resolves through it.
      const appearanceController = createAppearanceController({ eventBus });

      const services = createShellServices(() => authConfigRef.current, {
        appearanceController,
        // The navigation service publishes `navigation.back.requested` on it
        // and waits for the mini app's reply — see `useMiniAppBackButton`.
        eventBus,
      }) as unknown as ShellServiceMap;
      appearanceController.apply();

      const loader = createRuntimeLoader({
        maxModules: resolveMaxCachedMiniApps(),
        onLoadStart: (moduleId) => {
          eventBus.emit("module.lifecycle.loading", "shell", {
            moduleId,
            version: "",
          });
        },
        onLoadComplete: (result) => {
          console.log("Successfully load", result.success);
        },
        onLoadError: (moduleId, error) => {
          eventBus.emit("module.lifecycle.failed", "shell", {
            moduleId,
            version: "",
            error,
          });
        },
      });

      const communicator = createHostPlatform({
        services,
        eventBus,
        transport: new PostMessageTransport(),
        allowedOrigins: ["*"],
        onModuleConnected: (moduleId) => {
          eventBus.emit("module.lifecycle.loaded", moduleId, {
            moduleId,
            version: "",
          });
        },
        onModuleDisconnected: (moduleId) => {
          eventBus.emit("module.lifecycle.unloaded", moduleId, {
            moduleId,
            version: "",
          });
          ``;
        },
      });

      const platform: PlatformContextValue = {
        eventBus,
        communicator,
        loader,
        services,
        appearance: appearanceController,
        isReady: false,
      };

      platformRef.current = platform;

      await communicator.initialize();

      if (!cancelled) {
        setPlatform({ ...platform, isReady: true });
      }

      cleanupInterval = setInterval(() => eventBus.cleanup(), 300000);

      // Pull the Mini App SDK bundle into IndexedDB now, while the portal is
      // idle, rather than when a mini app opens and the user is watching the
      // loader. Downloads only; the bytes are executed by `loadMiniAppSdk` at
      // open time, which by then is an IndexedDB read. No-ops when the bundle
      // is already cached or the cache is disabled. See `sdkCache.md` §5.
      cancelSdkWarm = scheduleSdkWarm();
    }

    init().catch(console.error);

    return () => {
      cancelled = true;
      clearInterval(cleanupInterval);
      cancelSdkWarm?.();
      const p = platformRef.current;
      if (p) {
        p.communicator.destroy();
        p.eventBus.destroy();
        platformRef.current = null;
      }
    };
  }, []);

  if (!platform?.isReady) {
    return null;
  }

  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used within PlatformProvider");
  return ctx;
}

export function useRuntimeLoader(): RuntimeLoader {
  return usePlatform().loader;
}

export function useEventBus(): EventBus {
  return usePlatform().eventBus;
}

/**
 * Number of mini-app bundles to keep in the PWA asset cache (FIFO eviction).
 * Configurable via `NEXT_PUBLIC_MAX_CACHED_MINI_APPS`; defaults to 2.
 * Oldest cached app assets are removed from IndexedDB once the limit is exceeded.
 */
function resolveMaxCachedMiniApps(): number {
  const raw = process.env.NEXT_PUBLIC_MAX_CACHED_MINI_APPS;
  if (!raw) return 2;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}
