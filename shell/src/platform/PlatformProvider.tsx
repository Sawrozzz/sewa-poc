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
import { createEventBus, type EventBus } from "@sewa/host-platform";

import {
  createHostPlatform,
  type HostPlatformHandle,
} from "@sewa/host-platform";
import { createRuntimeLoader, type RuntimeLoader } from "@sewa/runtime-loader";
import { type ShellServiceMap, PostMessageTransport } from "@sewa/host-platform";
import { createShellServices, type PlatformServicesConfig } from "./services";

export interface PlatformContextValue {
  eventBus: EventBus;
  communicator: HostPlatformHandle;
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

    function installHostApiGuard() {
      const lock = (obj: unknown, prop: string, value: unknown) => {
        if (!obj || typeof obj !== 'object' || !(prop in obj)) return;
        try {
          Object.defineProperty(obj, prop, { value, writable: false, configurable: false });
        } catch { /* ignore unfrozen / undefined */ }
      };

      const deny = (msg: string) => () => Promise.reject(new DOMException(msg, 'NotAllowedError'));

      const geoErr = () => ({
        code: 1, message: '[HostGuard] Use sdk.device.location() instead.',
        PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
      });

      // File picker
      // lock(window, 'showOpenFilePicker', undefined);
      // lock(window, 'showSaveFilePicker', undefined);
      // lock(window, 'showDirectoryPicker', undefined);

      // // Media
      // lock(navigator.mediaDevices, 'getUserMedia', deny('[HostGuard] Use sdk.device.camera().'));
      // lock(navigator.mediaDevices, 'getDisplayMedia', deny('[HostGuard] Screen capture disabled.'));

      // // Geolocation
      // lock(navigator.geolocation, 'getCurrentPosition', (_success: unknown, error?: unknown) => {
      //   if (typeof error === 'function') error(geoErr());
      // });
      // lock(navigator.geolocation, 'watchPosition', (_success: unknown, error?: unknown) => {
      //   if (typeof error === 'function') error(geoErr());
      //   return -1;
      // });
      // lock(navigator.geolocation, 'clearWatch', () => {});

      // // Clipboard read
      // lock(navigator.clipboard, 'read', deny('[HostGuard] Clipboard read disabled.'));
      // lock(navigator.clipboard, 'readText', deny('[HostGuard] Clipboard read disabled.'));

      // // Notifications
      // if (window.Notification) {
      //   lock(Notification, 'requestPermission', () => Promise.resolve('denied'));
      //   try { Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: false }); } catch {}
      // }

      // // Service workers
      // lock(navigator.serviceWorker, 'register', deny('[HostGuard] Service workers disabled.'));

      // // WebRTC
      // lock(window, 'RTCPeerConnection', undefined);
      // lock(window, 'webkitRTCPeerConnection', undefined);

      // // Hardware APIs
      // lock(navigator, 'bluetooth', undefined);
      // lock(navigator, 'usb', undefined);
      // lock(navigator, 'serial', undefined);
      // lock(navigator, 'hid', undefined);
      // lock(navigator, 'vibrate', () => false);
    }

    async function init() {
      // Block sensitive browser APIs before any mini-app code runs
      installHostApiGuard();

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

 