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
import { Header } from "./Header";
import type { EventBus } from "@sewa/event-bus";
import type { RemoteLoadResult } from "@sewa/platform-contracts";

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
        config: { tenantId: "acme-corp", locale: "en-US", theme: "light" },
    };
}

export interface MiniAppContainerProps {
    moduleId: string;
}

export function MiniAppContainer({ moduleId }: MiniAppContainerProps) {
    const router = useRouter();
    const { data: session, isPending: authLoading } = authClient.useSession();
    const user = mapSessionUser(session?.user);
    const { communicator, services } = usePlatform();
    const loader = useRuntimeLoader();
    const eventBus = useEventBus();
    const isAuthenticated = !!session;
    const { data: manifest, isLoading: manifestLoading, error: manifestError } = useMiniApp(moduleId);

    const containerRef = useRef<HTMLDivElement>(null);
    const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [loadError, setLoadError] = useState("");
    const [loadTimeMs, setLoadTimeMs] = useState(0);
    const mountCount = useRef(0);
    const cleanupDone = useRef(false);
    const sdkLoaded = useRef(false);

    const initMiniAppBridge = useCallback(async () => {
        if (sdkLoaded.current) return;
        sdkLoaded.current = true;

        const CDN_URL = "https://cdn.jsdelivr.net/npm/@sawrozzz/sdk-revised@1.2.2/dist/sdk-revised.min.js";
        let sdkReady = typeof window.getMiniAppBridge === "function";

        if (!sdkReady) {
            await new Promise<void>((resolve, reject) => {
                const script = document.createElement("script");
                script.src = CDN_URL;
                script.async = true;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error("Failed to load SDK from CDN"));
                document.head.appendChild(script);
            });
        }

        if (typeof window.getMiniAppBridge === "function") {
            await window.getMiniAppBridge()!.createInstance({
                moduleId,
                sdkOptions: { timeout: 30000, retryAttempts: 5, retryDelayMs: 500, targetOrigin: "*" },
            });
        }
    }, [moduleId]);

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
            result = await loader.load(moduleId, manifest.bundleUrl, manifest.version, { retryAttempts: 3 });
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Failed to load module");
            setLoadState("error");
            return;
        }

        setLoadTimeMs(result.loadTimeMs);

        if (result.success && result.bundle) {
            setLoadState("ready");
            eventBus.emit("module.lifecycle.loaded", "shell", {
                moduleId,
                version: manifest.version,
                loadTimeMs: result.loadTimeMs,
            });
        } else {
            setLoadError(result.error ?? "Failed to load plugin bundle");
            setLoadState("error");
            eventBus.emit("module.lifecycle.failed", "shell", {
                moduleId,
                version: manifest.version,
                error: result.error,
            });
        }
    }, [manifest, moduleId, loader, eventBus, initMiniAppBridge]);

    useEffect(() => {
        if (loadState !== "ready" || !containerRef.current) return;

        const loadedModule = loader.getLoadedModule(moduleId);
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
    }, [loadState, moduleId, loader, eventBus, communicator]);

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
            setLoadError(`Module "${moduleId}" not found`);
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
                loader.unload(moduleId);
                communicator.disconnectModule(moduleId);
            };
        }

        return () => {};
    }, [authLoading, manifestLoading, manifest, manifestError, isAuthenticated, loadModule, router, loader, moduleId, communicator]);

    const handleRetry = useCallback(() => {
        setLoadError("");
        setLoadState("idle");
        loader.unload(moduleId).then(() => loadModule());
    }, [loader, moduleId, loadModule]);

    const handleUnload = useCallback(() => {
        loader.unload(moduleId);
        router.push("/");
    }, [loader, moduleId, router]);

    if (authLoading || manifestLoading || loadState === "idle" || loadState === "loading") {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-50">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-gov-200 border-t-gov-600 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-600">Loading plugin bundle...</p>
                    <p className="text-xs text-gray-400 mt-1">
                        {manifest?.name ?? moduleId}
                    </p>
                </div>
            </div>
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
                        className="text-sm text-gov-600 hover:underline"
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
                    className="group mr-5 flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gov-600"
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
                    moduleId={moduleId}
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
