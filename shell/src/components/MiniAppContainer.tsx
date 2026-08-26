"use client";

import { resolveDataCapabilities, resolveMiniAppCapabilities } from "@sewa/host-platform";
import { ArrowLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEventBus, usePlatform, useRuntimeLoader } from "@/context";
import { authClient } from "@/lib/auth-client";
import { bundleFetchUrl } from "@/lib/modules-api";
import { useMiniApp, useRegistryMiniApp } from "@/lib/use-mini-apps";
import { useMiniAppBackButton } from "@/platform";
import { destroyMiniAppSdk, loadMiniAppSdk } from "@/platform/sdk";
import { setModuleManifestCache } from "@/platform/services";
import { MiniAppErrorBoundary } from "./MiniAppErrorBoundary";
import { MiniAppLoader } from "./MiniAppLoader";

export type MiniAppSource = "fallback" | "registry";

interface MiniAppDescriptor {
  name: string;
  icon?: string;
  color?: string;
  version?: string;
  bundleUrl: string;
  bundleHash?: string;
}

export interface MiniAppContainerProps {
  miniAppId: string;
  isDark: boolean;
  source?: MiniAppSource;
}

export interface RemoteLoadResult {
  moduleId: string;
  success: boolean;
  loadTimeMs: number;
  strategy: "plugin";
  bundle?: {
    mount: (container: HTMLElement, props?: Record<string, unknown>) => void;
    unmount: (container: HTMLElement) => void;
  };
  error?: string;
  version?: string;
}

export function MiniAppContainer({
  miniAppId,
  isDark,
  source = "registry",
}: MiniAppContainerProps) {
  const router = useRouter();
  const isRegistry = source === "registry";

  const { data: session, isPending: authLoading } = authClient.useSession();
  const { communicator } = usePlatform();
  const loader = useRuntimeLoader();
  const eventBus = useEventBus();

  const {
    data: fallbackManifest,
    isLoading: fallbackLoading,
    error: fallbackError,
  } = useMiniApp(isRegistry ? null : miniAppId);
  const {
    data: registryApp,
    isLoading: registryLoading,
    error: registryError,
  } = useRegistryMiniApp(isRegistry ? miniAppId : null);

  const manifestLoading = isRegistry ? registryLoading : fallbackLoading;
  const manifestError = isRegistry ? registryError : fallbackError;

  const manifest = useMemo<MiniAppDescriptor | null>(() => {
    if (isRegistry) {
      // A manifest entry with no `bundleUrl` is not loadable, so it is treated
      // as no entry at all rather than failing later inside the loader.
      return registryApp?.bundleUrl
        ? {
            name: registryApp.displayName ?? registryApp.miniAppId,
            version: registryApp.version,
            // Archives are downloaded through the shell's proxy — the storage
            // origin serving them sends no CORS headers.
            bundleUrl: bundleFetchUrl(registryApp.bundleUrl),
            bundleHash: registryApp.bundleHash,
          }
        : null;
    }
    return fallbackManifest
      ? {
          name: fallbackManifest.name,
          icon: fallbackManifest.icon,
          color: fallbackManifest.color,
          version: fallbackManifest.version,
          bundleUrl: fallbackManifest.bundleUrl,
        }
      : null;
  }, [isRegistry, registryApp, fallbackManifest]);

  /**
   * What this mini app may call: whatever it declares, plus the core namespaces
   * every app needs in order to connect.
   *
   * `resolveCapabilities` is the single definition of that union — the RPC
   * server runs it again over the cached manifest and lands on the same list,
   * so what the SDK is told it has and what the gate enforces cannot drift.
   * For a registry app this is exactly the merge's `mergedCapabilities`.
   */
  const grantedDataCapabilities = useMemo(
    () => resolveDataCapabilities(isRegistry ? registryApp : fallbackManifest),
    [isRegistry, registryApp, fallbackManifest],
  );
  const grantedMiniAppCapabilities = useMemo(
    () => resolveMiniAppCapabilities(isRegistry ? registryApp : fallbackManifest),
    [isRegistry, registryApp, fallbackManifest],
  );

  // Publish the manifest to the cache the RpcServer reads on handshake — an
  // unregistered module is granted nothing beyond the core namespaces.
  //
  // Stored exactly as published, declared `capabilities` and all: the server
  // resolves it itself, and overwriting the field here would throw away the
  // difference between what the mini app asked for and what it was granted.
  useEffect(() => {
    const source = isRegistry ? registryApp : fallbackManifest;
    if (!source) return;

    setModuleManifestCache([source]);
  }, [isRegistry, registryApp, fallbackManifest]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState("");

  const mountCount = useRef(0);
  const cleanupDone = useRef(false);
  const sdkLoaded = useRef(false);

  const initMiniAppBridge = useCallback(async () => {
    if (sdkLoaded.current) return;
    await loadMiniAppSdk(miniAppId, { capabilities: grantedDataCapabilities, ...grantedMiniAppCapabilities });
    sdkLoaded.current = true;
  }, [miniAppId, grantedDataCapabilities, grantedMiniAppCapabilities]);

  const loadModule = useCallback(async () => {
    if (!manifest) return;
    setLoadState("loading");

    try {
      await initMiniAppBridge();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "SDK initialization failed");
      setLoadState("error");
      return;
    }

    let result: RemoteLoadResult;
    try {
      // Registry apps arrive as a signed `.zip`: download → hash-check against
      // the manifest → unpack into IndexedDB. Pre-installed apps keep fetching
      // their files individually from the bundle base URL.
      result =
        manifest.bundleHash !== undefined
          ? await loader.loadBundle(miniAppId, manifest.bundleUrl, {
              bundleHash: manifest.bundleHash,
              version: manifest.version,
              retryAttempts: 2,
            })
          : await loader.load(miniAppId, manifest.bundleUrl, manifest.version, {
              retryAttempts: 3,
            });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load module");
      setLoadState("error");
      return;
    }

    if (result.success && result.bundle) {
      setLoadState("ready");
      eventBus.emit("module.lifecycle.loaded", "shell", {
        miniAppId,
        version: manifest.version,
        loadTimeMs: result.loadTimeMs,
      });
    } else {
      setLoadError(result.error ?? "Failed to load plugin bundle");
      setLoadState("error");
      eventBus.emit("module.lifecycle.failed", "shell", {
        miniAppId,
        version: manifest.version,
        error: result.error,
      });
    }
  }, [manifest, miniAppId, loader, eventBus, initMiniAppBridge]);

  useEffect(() => {
    if (loadState !== "ready" || !containerRef.current) return;

    const loadedModule = loader.getLoadedModule(miniAppId);
    if (!loadedModule?.bundle) return;

    const container = containerRef.current;
    loadedModule.bundle.mount(container);

    return () => {
      loadedModule.bundle.unmount(container);
    };
  }, [loadState, miniAppId, loader]);

  useEffect(() => {
    if (authLoading || manifestLoading) return;

    if (!session) {
      router.replace("/");
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

  const exitToPortal = useCallback(() => router.push("/"), [router]);
  useMiniAppBackButton({ onExit: exitToPortal, enabled: loadState === "ready" });

  const handleRetry = useCallback(() => {
    setLoadError("");
    setLoadState("idle");
    loader.unload(miniAppId).then(() => loadModule());
  }, [loader, miniAppId, loadModule]);

  const handleUnload = useCallback(() => {
    loader.unload(miniAppId);
    router.push("/");
  }, [loader, miniAppId, router]);

  if (authLoading || manifestLoading) {
    return (
      <MiniAppLoader
        color={manifest?.color}
        icon={manifest?.icon}
        name={manifest?.name ?? miniAppId}
      />
    );
  }

  const manifestFailure =
    manifestError?.message ?? (!manifest ? `Module "${miniAppId}" not found` : null);

  if (loadState === "error" || loadError || manifestFailure) {
    const message = loadError || manifestFailure || "";
    return (
      <div className={`flex items-center justify-center h-screen`}>
        <div className="text-center max-w-md">
          <span className="text-4xl mb-3 block">⚠️</span>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">{message}</h1>
          <button
            className="text-sm text-gov-800 hover:underline"
            onClick={() => router.push("/")}
            type="button"
          >
            ←
          </button>
        </div>
      </div>
    );
  }

  if (loadState === "idle" || loadState === "loading") {
    return (
      <MiniAppLoader
        color={manifest?.color}
        icon={manifest?.icon}
        name={manifest?.name ?? miniAppId}
      />
    );
  }

  return !manifest ? null : (
    <div className={`h-screen flex flex-col`}>
      <div
        className={`safe-top flex shrink-0 flex-row items-center px-2 py-2 ${
          isDark ? "bg-gray-800" : "bg-white"
        }`}
      >
        <button
          aria-label="Back"
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            isDark
              ? "text-gray-300 hover:bg-gray-700 hover:text-white"
              : "text-gray-500 hover:bg-gov-50 hover:text-gov-800"
          }`}
          onClick={() => router.push("/")}
          type="button"
        >
          <ArrowLeftIcon size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <MiniAppErrorBoundary
          miniAppId={miniAppId}
          moduleName={manifest.name}
          onRetry={handleRetry}
          onUnload={handleUnload}
          retryAttempts={3}
        >
          <div className="w-full h-full" ref={containerRef} />
        </MiniAppErrorBoundary>
      </div>
    </div>
  );
}
