"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactDOM from "react-dom/client";
import { createEventBus, type EventBus } from "@sewa/event-bus";

import {
  createShellCommunicator,
  type ShellCommunicator,
} from "@sewa/shell-communicator";
import { createRuntimeLoader, type RuntimeLoader } from "@sewa/runtime-loader";
import { type ShellServiceMap, PostMessageTransport } from "@sewa/platform-contracts";
import { createShellServices, type PlatformServicesConfig } from "./services";

export interface PlatformContextValue {
  eventBus: EventBus;
  communicator: ShellCommunicator;
  loader: RuntimeLoader;
  services: ShellServiceMap;
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
export function PlatformProvider({
  children,
  authConfig,
}: PlatformProviderProps) {
  const platformRef = useRef<PlatformContextValue | null>(null);
  const authConfigRef = useRef(authConfig);
  const [isReady, setIsReady] = useState(false);

  authConfigRef.current = authConfig;

  useEffect(() => {
    if (platformRef.current) return;

    let cancelled = false;

    let cleanupInterval: ReturnType<typeof setInterval>;

    async function init() {
      // Expose shell's React to mini-app bundles (they reference window.React)
      (window as unknown as Record<string, unknown>).React = React;
      (window as unknown as Record<string, unknown>).ReactDOM = ReactDOM;

      const eventBus = createEventBus({
        enableTracing: process.env.NODE_ENV === "development",
        onError: (err, event) => {
          console.error("[EventBus] Handler error:", err.message, event.type);
        },
      });

      const services = createShellServices(() => authConfigRef.current);

      const loader = createRuntimeLoader({
        onLoadComplete: (result) => {
          services.telemetry.track(
            {
              moduleId: result.moduleId,
              traceId: "loader",
              sessionId: "loader",
            },
            "module.loaded",
            { loadTimeMs: result.loadTimeMs, strategy: result.strategy },
          );
          const metrics = services.telemetry.getMetrics();
          if (!metrics.moduleLoadTimesMs[result.moduleId]) {
            metrics.moduleLoadTimesMs[result.moduleId] = [];
          }
          metrics.moduleLoadTimesMs[result.moduleId].push(result.loadTimeMs);
        },
        onLoadError: (moduleId, error) => {
          eventBus.emit("module.lifecycle.failed", "shell", {
            moduleId,
            version: "",
            error,
          });
        },
      });

        const communicator = createShellCommunicator({
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
        },
      });

      const platform: PlatformContextValue = {
        eventBus,
        communicator,
        loader,
        services,
        isReady: false,
      };

      platformRef.current = platform;

      await communicator.initialize();

      if (!cancelled) {
        platform.isReady = true;
        setIsReady(true);
      }

      cleanupInterval = setInterval(() => eventBus.cleanup(), 300000);
    }

    init().catch(console.error);

    return () => {
      cancelled = true;
      clearInterval(cleanupInterval);
      const p = platformRef.current;
      if (p) {
        p.communicator.destroy();
        p.eventBus.destroy();
        platformRef.current = null;
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!platformRef.current || !isReady) {
    return null;
  }

  return (
    <PlatformContext.Provider value={{ ...platformRef.current, isReady }}>
      {children}
    </PlatformContext.Provider>
  );
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
