'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Header } from './Header';
import { MiniAppErrorBoundary } from './MiniAppErrorBoundary';
import { MiniAppLoader } from './MiniAppLoader';

import type { EventBus, RemoteLoadResult } from '@sewa/host-platform';

import { authClient } from '@/lib/auth-client';
import { useMiniApp } from '@/lib/use-mini-apps';
import { useRuntimeLoader, useEventBus, usePlatform } from '@/platform';
import { loadMiniAppSdk, destroyMiniAppSdk } from '@/platform/sdk-bootstrap';

interface SDKBridge {
  invoke<T = unknown>(action: string, payload?: unknown): Promise<T>;
  emit(event: string, payload?: unknown): void;
  subscribe(event: string, callback: (payload?: unknown) => void): () => void;
}

interface Runtime {
  sdk: SDKBridge;
  config: Record<string, unknown>;
}

function createMiniAppRuntime(eventBus: EventBus, _communicator: unknown): Runtime {
  const sdk: SDKBridge = {
    async invoke<T = unknown>(action: string, payload?: unknown): Promise<T> {
      switch (action) {
        case 'host.getTenantConfig':
          return { tenantId: 'acme-corp', plan: 'enterprise' } as T;
        case 'host.showToast':
          console.log('[MiniApp Toast]', payload);
          return { shown: true } as T;
        default:
          throw new Error(`Unknown SDK action: ${action}`);
      }
    },
    emit(event, payload) {
      eventBus.emit(event, 'mini-app', payload);
    },
    subscribe(event, callback) {
      return eventBus.subscribe(event, (evt) => callback(evt.payload));
    },
  };

  return {
    sdk,
    config: {},
  };
}

export interface MiniAppContainerProps {
  miniAppId: string;
}

export function MiniAppContainer({ miniAppId }: MiniAppContainerProps) {
  const router = useRouter();
  const { data: session, isPending: authLoading } = authClient.useSession();
  const { communicator } = usePlatform();
  const loader = useRuntimeLoader();
  const eventBus = useEventBus();
  const {
    data: manifest,
    isLoading: manifestLoading,
    error: manifestError,
  } = useMiniApp(miniAppId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');
  const mountCount = useRef(0);
  const cleanupDone = useRef(false);
  const sdkLoaded = useRef(false);

  const initMiniAppBridge = useCallback(async () => {
    if (sdkLoaded.current) return;
    const { source, initTimeMs } = await loadMiniAppSdk(miniAppId);
    console.log(`[mini-app-sdk] initialized (source: ${source}, handshake: ${initTimeMs}ms)`);
    sdkLoaded.current = true;
  }, [miniAppId]);

  const loadModule = useCallback(async () => {
    if (!manifest) return;
    setLoadState('loading');

    try {
      await initMiniAppBridge();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'SDK initialization failed');
      setLoadState('error');
      return;
    }

    let result: RemoteLoadResult;
    try {
      result = await loader.load(miniAppId, manifest.bundleUrl, manifest.version, {
        retryAttempts: 3,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load module');
      setLoadState('error');
      return;
    }

    if (result.success && result.bundle) {
      setLoadState('ready');
      eventBus.emit('module.lifecycle.loaded', 'shell', {
        miniAppId,
        version: manifest.version,
        loadTimeMs: result.loadTimeMs,
      });
    } else {
      setLoadError(result.error ?? 'Failed to load plugin bundle');
      setLoadState('error');
      eventBus.emit('module.lifecycle.failed', 'shell', {
        miniAppId,
        version: manifest.version,
        error: result.error,
      });
    }
  }, [manifest, miniAppId, loader, eventBus, initMiniAppBridge]);

  useEffect(() => {
    if (loadState !== 'ready' || !containerRef.current) return;

    const loadedModule = loader.getLoadedModule(miniAppId);
    if (!loadedModule?.bundle) return;

    const container = containerRef.current;
    const runtime = createMiniAppRuntime(eventBus, communicator);
    const mountRuntime = {
      ...runtime,
      initialPath: window.location.hash.slice(1) || '',
    } as unknown as Parameters<typeof loadedModule.bundle.mount>[1];

    loadedModule.bundle.mount(container, mountRuntime);

    return () => {
      loadedModule.bundle.unmount(container);
    };
  }, [loadState, miniAppId, loader, eventBus, communicator]);

  useEffect(() => {
    if (authLoading || manifestLoading) return;

    if (!session) {
      router.replace('/');
      return;
    }

    if (manifestError || !manifest) return;

    mountCount.current += 1;
    if (mountCount.current === 1) {
      loadModule();
    }

    if (!cleanupDone.current) {
      cleanupDone.current = true;
      return () => {
        cleanupDone.current = false;
        loader.unload(miniAppId);
        communicator.disconnectModule(miniAppId);
        destroyMiniAppSdk();
      };
    }

    return () => {};
  }, [
    authLoading,
    manifestLoading,
    session,
    manifest,
    manifestError,
    loadModule,
    router,
    loader,
    miniAppId,
    communicator,
  ]);

  const handleRetry = useCallback(() => {
    setLoadError('');
    setLoadState('idle');
    loader.unload(miniAppId).then(() => loadModule());
  }, [loader, miniAppId, loadModule]);

  const handleUnload = useCallback(() => {
    loader.unload(miniAppId);
    router.push('/');
  }, [loader, miniAppId, router]);

  if (authLoading || manifestLoading) {
    return (
      <MiniAppLoader
        name={manifest?.name ?? miniAppId}
        icon={manifest?.icon}
        color={manifest?.color}
      />
    );
  }

  const manifestFailure =
    manifestError?.message ?? (!manifest ? `Module "${miniAppId}" not found` : null);

  if (loadState === 'error' || loadError || manifestFailure) {
    const message = loadError || manifestFailure || '';
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center max-w-md">
          <span className="text-4xl mb-3 block">⚠️</span>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">{message}</h1>
          <button onClick={() => router.push('/')} className="text-sm text-gov-800 hover:underline">
            ←
          </button>
        </div>
      </div>
    );
  }

  if (loadState === 'idle' || loadState === 'loading') {
    return (
      <MiniAppLoader
        name={manifest?.name ?? miniAppId}
        icon={manifest?.icon}
        color={manifest?.color}
      />
    );
  }

  return !manifest ? null : (
    <div className="h-screen flex flex-col">
      <div className="flex flex-row col-span-full">
        <button
          onClick={() => router.push('/')}
          className="group mr-5 flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gov-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 transition-transform group-hover:-translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Portal
        </button>
        <div className="flex-1">
          <Header />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <MiniAppErrorBoundary
          miniAppId={miniAppId}
          moduleName={manifest.name}
          retryAttempts={3}
          onRetry={handleRetry}
          onUnload={handleUnload}
        >
          <div ref={containerRef} className="w-full h-full" />
        </MiniAppErrorBoundary>
      </div>
    </div>
  );
}
