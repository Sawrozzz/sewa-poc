"use client";

import { resolveDataCapabilities, resolveMiniAppCapabilities } from "@sewa/host-platform";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlatform, useRuntimeLoader } from "@/context";
import { bundleFetchUrl } from "@/lib/modules-api";
import { useRegistryMiniApp } from "@/lib/use-mini-apps";
import { destroyMiniAppSdk, loadMiniAppSdk } from "@/platform/sdk";
import { setModuleManifestCache } from "@/platform/services";

export type EmbeddedMiniAppState = "idle" | "loading" | "ready" | "error";

export interface UseEmbeddedMiniAppOptions {
  miniAppId: string;
  /**
   * Gate on the bundle download. The manifest lookup runs regardless — it is
   * what decides whether the host should offer the app at all — but nothing is
   * fetched or mounted until this flips true.
   */
  enabled: boolean;
}

export interface EmbeddedMiniApp {
  /** Attach to the element the bundle should mount into. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  state: EmbeddedMiniAppState;
  error: string;
  /** Display name from the manifest, falling back to the id. */
  name: string;
  /** False while the manifest is still resolving, or if this app is not published. */
  isAvailable: boolean;
  retry: () => void;
}

/**
 * Loads a registry mini app into a host-owned element instead of a route.
 *
 * This is the same download → verify → mount sequence `MiniAppContainer`
 * performs, minus everything that is page-shaped: no session redirect, no
 * full-screen loader, no exit-to-portal. It is deliberately a separate hook
 * rather than a refactor of that component — the page path is the app's
 * critical route, and an embedded surface has different lifetime rules.
 *
 * IMPORTANT — the Mini App SDK is one instance per tab (`window.__GSA_SDK__`,
 * seeded with a single `miniAppId`). An embedded app may therefore only be
 * mounted on a surface where no full-page mini app is live. Today that holds:
 * the only caller is the phone portal at `/`, and every full-page mini app
 * lives under `/[slug]`. Mounting two at once would hand the second one the
 * first one's SDK identity.
 */
export function useEmbeddedMiniApp({
  miniAppId,
  enabled,
}: UseEmbeddedMiniAppOptions): EmbeddedMiniApp {
  const { communicator } = usePlatform();
  const loader = useRuntimeLoader();

  // Shares MANIFEST_KEY with the portal's own `useMiniApps()`, and reads the
  // catalog row out of the pages the grid already loaded, so asking for this
  // app on every portal render costs no extra request.
  const { data: app, isLoading: manifestLoading } = useRegistryMiniApp(miniAppId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<EmbeddedMiniAppState>("idle");
  const [error, setError] = useState("");

  const descriptor = useMemo(() => {
    // An entry with no `bundleUrl` is not loadable, so it counts as no entry
    // rather than as a failure discovered later inside the loader.
    if (!app?.bundleUrl) return null;
    return {
      name: app.displayName ?? miniAppId,
      version: app.version,
      // Archives are downloaded through the shell's proxy — the storage origin
      // serving them sends no CORS headers.
      bundleUrl: bundleFetchUrl(app.bundleUrl),
      bundleHash: app.bundleHash,
    };
  }, [app, miniAppId]);

  const grantedDeviceCapabilities = useMemo(() => resolveDataCapabilities(app), [app]);
  const grantedMiniAppCapabilities = useMemo(() => resolveMiniAppCapabilities(app), [app]);

  // Publish the manifest to the cache the RpcServer reads on handshake, exactly
  // as published — the server resolves the granted set itself.
  useEffect(() => {
    if (!app) return;
    setModuleManifestCache([app]);
  }, [app]);

  // `loadedRef` is what makes the teardown safe: the bundle is unloaded and the
  // SDK torn down only if this hook is what set them up.
  const loadedRef = useRef(false);
  // Guards the state writes that land after an await, once the surface is gone.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!descriptor) return;

    setError("");
    setState("loading");

    try {
      await loadMiniAppSdk(miniAppId, { capabilities: grantedDeviceCapabilities, ...grantedMiniAppCapabilities });
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : "SDK initialization failed");
      setState("error");
      return;
    }

    try {
      // A registry app arrives as a signed `.zip`: download → hash-check
      // against the manifest → unpack into IndexedDB.
      const result =
        descriptor.bundleHash !== undefined
          ? await loader.loadBundle(miniAppId, descriptor.bundleUrl, {
              bundleHash: descriptor.bundleHash,
              version: descriptor.version,
              retryAttempts: 2,
            })
          : await loader.load(miniAppId, descriptor.bundleUrl, descriptor.version, {
              retryAttempts: 3,
            });

      if (!aliveRef.current) return;

      if (result.success && result.bundle) {
        setState("ready");
      } else {
        setError(result.error ?? "Failed to load plugin bundle");
        setState("error");
      }
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load module");
      setState("error");
    }
  }, [descriptor, miniAppId, grantedDeviceCapabilities, loader, grantedMiniAppCapabilities]);

  // Loads once, on the first render where the surface asks for it. `loadedRef`
  // — not the dependency list — is what keeps a re-render from reloading:
  // `descriptor` gets a new identity whenever the manifest query refreshes.
  useEffect(() => {
    if (!enabled || !descriptor || loadedRef.current) return;
    loadedRef.current = true;
    load();
  }, [enabled, descriptor, load]);

  // Teardown is its own effect so it runs only when the host surface goes away
  // — not every time `enabled` or the descriptor changes.
  useEffect(() => {
    return () => {
      if (!loadedRef.current) return;
      loadedRef.current = false;
      loader.unload(miniAppId);
      communicator.disconnectModule(miniAppId);
      destroyMiniAppSdk();
    };
  }, [loader, communicator, miniAppId]);

  // Mount the bundle once it is ready. Keeping the container in the DOM while
  // the panel is merely hidden is what preserves the mini app's state between
  // open and close — unmounting it would reset the conversation.
  useEffect(() => {
    if (state !== "ready") return;

    const container = containerRef.current;
    if (!container) return;

    const loadedModule = loader.getLoadedModule(miniAppId);
    if (!loadedModule?.bundle) return;

    loadedModule.bundle.mount(container);
    return () => {
      loadedModule.bundle.unmount(container);
    };
  }, [state, miniAppId, loader]);

  const retry = useCallback(() => {
    setError("");
    setState("idle");
    // Unload first: a half-loaded module left in the registry would make the
    // next `loadBundle` a no-op that reports success.
    loader.unload(miniAppId).then(() => {
      if (aliveRef.current) load();
    });
  }, [loader, miniAppId, load]);

  return {
    containerRef,
    state,
    error,
    name: descriptor?.name ?? miniAppId,
    isAvailable: !manifestLoading && !!descriptor,
    retry,
  };
}
