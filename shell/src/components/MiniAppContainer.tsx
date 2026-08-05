"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { useRouter } from "next/navigation";
import { authClient, mapSessionUser } from "@/lib/auth-client";
import {
    useRuntimeLoader,
    useEventBus,
    usePlatform,
} from "@/platform";
import { useMiniApp } from "@/lib/use-mini-apps";
import { MiniAppErrorBoundary } from "./MiniAppErrorBoundary";
import { MiniAppLoader } from "./MiniAppLoader";
import { Header } from "./Header";
import type { EventBus } from "@sewa/host-platform";
import type { RemoteLoadResult } from "@sewa/host-platform";

interface SDKBridge {
    invoke<T = unknown>(action: string, payload?: unknown): Promise<T>;
    emit(event: string, payload?: unknown): void;
    subscribe(event: string, callback: (payload?: unknown) => void): () => void;
}

/**
 * @lizuz/sewa-sdk v1.x CDN contract:
 *  - The host seeds `window.__GSA_SDK__` with a `MiniAppSdkOptions` object
 *    BEFORE the CDN <script> runs. The bundle reads it, constructs a single
 *    `MiniAppSdk`, and stores the live instance back on the same key.
 *  - `window.__GSA_HOST_DESCRIPTOR__` is read at construction time to expose
 *    the static host descriptor (type, version, capabilities, sdkVersion).
 *  - One instance per tab; `destroy()` removes it from the global again.
 */
const SDK_GLOBAL_KEY = "__GSA_SDK__";
const HOST_DESCRIPTOR_GLOBAL_KEY = "__GSA_HOST_DESCRIPTOR__";
// const SDK_CDN_URL =
//     "https://cdn.jsdelivr.net/npm/@lizuz/sewa-sdk@1.0.2/dist/sewa-sdk.min.js";
// const SDK_CDN_URL = 'http://10.10.30.82:9000/dist/sewa-sdk.min.js';
const SDK_CDN_URL = '/sdk/sewa-sdk.min.js';

/** The live SDK instance on `window.__GSA_SDK__`, or null when absent/not ready. */
function getSdkInstance() {
    const sdk = window.__GSA_SDK__;
    return sdk && typeof sdk.initialize === "function" ? sdk : null;
}

interface Runtime {
    sdk: SDKBridge;
    config: Record<string, unknown>;
}

function createMiniAppRuntime(eventBus: EventBus, _communicator: unknown): Runtime {
    const sdk: SDKBridge = {
        async invoke<T = unknown>(action: string, payload?: unknown): Promise<T> {
            switch (action) {
                case "host.getTenantConfig":
                    return { tenantId: "acme-corp", plan: "enterprise" } as T;
                case "host.showToast":
                    console.log("[MiniApp Toast]", payload);
                    return { shown: true } as T;
                default:
                    throw new Error(`Unknown SDK action: ${action}`);
            }
        },
        emit(event, payload) {
            eventBus.emit(event, "mini-app", payload);
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
    const user = mapSessionUser(session?.user);
    const { communicator, services } = usePlatform();
    const loader = useRuntimeLoader();
    const eventBus = useEventBus();
    const isAuthenticated = !!session;
    const { data: manifest, isLoading: manifestLoading, error: manifestError } = useMiniApp(miniAppId);

    const containerRef = useRef<HTMLDivElement>(null);
    const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [loadError, setLoadError] = useState("");
    const [loadTimeMs, setLoadTimeMs] = useState(0);
    const mountCount = useRef(0);
    const cleanupDone = useRef(false);
    const sdkLoaded = useRef(false);

    const initMiniAppBridge = useCallback(async () => {
        if (sdkLoaded.current) return;

        const w = window as unknown as Record<string, unknown>;
        let sdk = getSdkInstance();

        if (!sdk) {
            // Seed the config the CDN build reads at load. `targetOrigin` is
            // pinned to the shell's own origin: mini apps run in this same
            // window, so the SDK's `window.parent.postMessage` round-trips to
            // itself — exact-origin delivery works, and inbound messages from
            // any other origin are dropped.
            w[SDK_GLOBAL_KEY] = {
                miniAppId,
                timeout: 30000,
                retryAttempts: 5,
                retryDelayMs: 500,
                maxRetryDelayMs: 10000,
                targetOrigin: window.location.origin,
            };
            w[HOST_DESCRIPTOR_GLOBAL_KEY] = {
                type: "web",
                version: "1.0.0",
                capabilities: [
                    "auth",
                    "permissions",
                    "flags",
                    "config",
                    "navigation",
                    "platform",
                    "device",
                    "storage",
                    "api",
                    "http",
                    "appearance",
                    "event",
                    "ai",
                    "sdk",
                ],
                sdkVersion: "1.0.2",
            };

            await new Promise<void>((resolve, reject) => {
                const script = document.createElement("script");
                script.src = SDK_CDN_URL;
                script.async = true;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error("Failed to load SDK from CDN"));
                document.head.appendChild(script);
            });

            sdk = getSdkInstance();
            if (!sdk) {
                throw new Error("Mini App SDK did not initialize after loading");
            }
        }

        // The CDN build starts `initialize()` itself; awaiting it (idempotent
        // and concurrency-safe) guarantees the handshake completed before the
        // mini-app bundle mounts and starts calling SDK methods.
        await sdk.initialize();
        sdkLoaded.current = true;
    }, [miniAppId]);

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
            result = await loader.load(miniAppId, manifest.bundleUrl, manifest.version, { retryAttempts: 3 });
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Failed to load module");
            setLoadState("error");
            return;
        }

        setLoadTimeMs(result.loadTimeMs);

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
            router.replace("/");
            return;
        }

        if (manifestError) {
            setLoadError(manifestError.message);
            setLoadState("error");
            return;
        }

        if (!manifest) {
            setLoadError(`Module "${miniAppId}" not found`);
            setLoadState("error");
            return;
        }

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
                window.__GSA_SDK__?.destroy();
            };
        }

        return () => {};
    }, [authLoading, manifestLoading, manifest, manifestError, isAuthenticated, loadModule, router, loader, miniAppId, communicator]);

    const handleRetry = useCallback(() => {
        setLoadError("");
        setLoadState("idle");
        loader.unload(miniAppId).then(() => loadModule());
    }, [loader, miniAppId, loadModule]);

    const handleUnload = useCallback(() => {
        loader.unload(miniAppId);
        router.push("/");
    }, [loader, miniAppId, router]);

    if (authLoading || manifestLoading || loadState === "idle" || loadState === "loading") {
        return (
            <MiniAppLoader
                name={manifest?.name ?? miniAppId}
                icon={manifest?.icon}
                color={manifest?.color}
            />
        );
    }

    if (loadState === "error" || loadError) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <div className="text-center max-w-md">
                    <span className="text-4xl mb-3 block">⚠️</span>
                    <h1 className="text-lg font-semibold text-gray-900 mb-2">{loadError}</h1>
                    <button
                        onClick={() => router.push("/")}
                        className="text-sm text-gov-800 hover:underline"
                    >
                        ←
                    </button>
                </div>
            </div>
        );
    }

    return !manifest ? null : (
        <div className="h-screen flex flex-col">
            <div className="flex flex-row col-span-full">
                <button
                    onClick={() => router.push("/")}
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
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 19l-7-7 7-7"
                        />
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
