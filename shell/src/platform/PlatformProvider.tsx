'use client';

import {
  createEventBus,
  type EventBus,
  createHostPlatform,
  type HostPlatformHandle,
  type ShellServiceMap,
  PostMessageTransport,
} from '@sewa/host-platform';
import { createRuntimeLoader, type RuntimeLoader } from '@sewa/runtime-loader';
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { createAppearanceController, type AppearanceController } from './appearance-controller';
import { installHostApiGuard } from './host-guard';
import { createShellServices, type PlatformServicesConfig } from './services';

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

    async function init() {
      // Block sensitive browser APIs before any mini-app code runs
      installHostApiGuard();

      const eventBus = createEventBus({
        enableTracing: process.env.NODE_ENV === 'development',
        onError: (err, event) => {
          console.error('[EventBus] Handler error:', err.message, event.type);
        },
      });

      // Host-driven appearance: owns locale/theme/tokens/shell catalog. Created
      // before services so config.locale resolves through it.
      const appearanceController = createAppearanceController({ eventBus });

      const services = createShellServices(() => authConfigRef.current, {
        appearanceController,
      });
      appearanceController.apply();

      const loader = createRuntimeLoader({
        maxModules: resolveMaxCachedMiniApps(),
        onLoadStart: (moduleId) => {
          eventBus.emit('module.lifecycle.loading', 'shell', {
            moduleId,
            version: '',
          });
        },
        onLoadComplete: (result) => {
          console.log('Successfully load', result.success);
        },
        onLoadError: (moduleId, error) => {
          eventBus.emit('module.lifecycle.failed', 'shell', {
            moduleId,
            version: '',
            error,
          });
        },
      });

      const communicator = createHostPlatform({
        services,
        eventBus,
        transport: new PostMessageTransport(),
        allowedOrigins: ['*'],
        onModuleConnected: (moduleId) => {
          eventBus.emit('module.lifecycle.loaded', moduleId, {
            moduleId,
            version: '',
          });
        },
        onModuleDisconnected: (moduleId) => {
          eventBus.emit('module.lifecycle.unloaded', moduleId, {
            moduleId,
            version: '',
          });
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
  }, []);

  if (!platform || !platform.isReady) {
    return null;
  }

  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
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
