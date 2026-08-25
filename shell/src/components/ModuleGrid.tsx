"use client";

import type { OldModuleManifest } from "@sewa/host-platform";
import { useEffect, useMemo, useRef } from "react";
import {
  useFallbackMiniApps,
  useMiniAppCatalog,
  useMiniApps,
  useRefreshMiniApps,
} from "@/hooks/use-mini-apps";
import { authClient, mapSessionUser } from "@/lib/auth-client";
import { OldMiniAppCard } from "./MiniAppCard";
import { NewMiniAppCard } from "./NewMiniAppCard";

// Helpers for Old / Fallback Modules
function filterByPermission(mods: OldModuleManifest[], permissions: string[]) {
  return mods
    .filter((m) => m.isEnabled)
    .filter((m) => m.requiredPermissions?.every((p) => permissions.includes(p)))
    .sort((a, b) => a.order - b.order);
}

function groupByCategory(mods: OldModuleManifest[]) {
  return mods.reduce<Record<string, OldModuleManifest[]>>((acc, m) => {
    const cat = m.category || "Other";
    acc[cat] = acc[cat] || [];
    acc[cat].push(m);
    return acc;
  }, {});
}

// Category Section for Old Modules
function OldCategorySection({
  category,
  oldModules,
}: {
  category: string;
  oldModules: OldModuleManifest[];
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-gov-500 rounded-full" />
        {category}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {oldModules.map((mod) => (
          <OldMiniAppCard key={mod.id} oldModule={mod} />
        ))}
      </div>
    </section>
  );
}

/** Whether a manifest query error came from the signature check rather than the network */
function isSignatureError(error: Error | null): boolean {
  return !!error?.message?.toLowerCase().includes("signature");
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-lg bg-gray-200" />
        <div className="w-12 h-4 rounded bg-gray-200" />
      </div>
      <div className="h-5 w-3/4 bg-gray-200 rounded mb-2" />
      <div className="h-4 w-full bg-gray-200 rounded mb-1" />
      <div className="h-4 w-2/3 bg-gray-200 rounded mb-4" />
      <div className="flex items-center justify-between">
        <div className="h-3 w-16 bg-gray-200 rounded" />
        <div className="h-4 w-12 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export function ModuleGrid() {
  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);
  const userPermissions = useMemo(() => user?.permissions ?? [], [user]);

  const fallbackModules = useFallbackMiniApps();
  const refreshMiniApps = useRefreshMiniApps();

  // The catalog supplies the list; the signed manifest supplies the bundle URL
  // and hash used when one is opened. Both are loaded here so a card click has
  // everything it needs already resolved.
  const {
    miniApps,
    isLoading: catalogLoading,
    isError: catalogFailed,
    error: catalogError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMiniAppCatalog();
  const { isError: manifestFailed, error: manifestError } = useMiniApps();

  // A manifest that cannot be trusted makes every card unopenable, so it takes
  // priority over a catalog failure.
  const isLoading = catalogLoading;
  const isError = manifestFailed || catalogFailed;
  const error = manifestFailed ? manifestError : catalogError;

  // Infinite scroll: pull the next page once the sentinel below the grid
  // scrolls into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting)
          void fetchNextPage().catch((e) => console.warn("[ModuleGrid] fetchNextPage failed:", e));
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Process Old Modules with filtering & grouping
  const filteredFallback = useMemo(
    () => filterByPermission(fallbackModules, userPermissions),
    [fallbackModules, userPermissions],
  );
  const fallbackGroups = useMemo(() => groupByCategory(filteredFallback), [filteredFallback]);

  return (
    <div className="space-y-10">
      {/* Dynamic Services Section - Unfiltered New Modules */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-gov-100 rounded-lg flex items-center justify-center">
            <span className="text-gov-800 text-sm">📦</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Available Services</h2>
            <p className="text-xs text-gray-500">Dynamically loaded services from the platform</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-12 bg-white rounded-xl border border-red-100">
            {/* A failed signature check is a trust problem, not a network one —
                say so, because the fix is a new manifest, not a retry. */}
            <div className="text-5xl mb-4">{isSignatureError(error) ? "🔒" : "📡"}</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isSignatureError(error)
                ? "Manifest Could Not Be Trusted"
                : "Could Not Load Services"}
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
              {error?.message ||
                "Unable to fetch services from the platform. Please check your connection."}
            </p>
            <button
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gov-500 text-gov-950 rounded-lg hover:bg-gov-600 transition text-sm font-medium"
              onClick={() =>
                void refreshMiniApps().catch((e) => console.warn("[ModuleGrid] refresh failed:", e))
              }
              type="button"
            >
              <span>🔄</span>
              Try Again
            </button>
          </div>
        ) : miniApps.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {miniApps.map((mod) => (
                <NewMiniAppCard key={mod.id ?? mod.miniAppId} newModule={mod} />
              ))}
            </div>

            {isFetchingNextPage ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
                {[1, 2, 3].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : null}

            {/* Tripping this into view loads the next page */}
            <div aria-hidden className="h-px" ref={sentinelRef} />

            {hasNextPage ? null : (
              <p className="text-center text-xs text-gray-400 mt-8">
                You&apos;ve reached the end of the list.
              </p>
            )}
          </>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
            <p className="text-sm text-gray-500">No services available at this time.</p>
          </div>
        )}
      </div>
      {/* Playground / Fallback Section */}
      {Object.keys(fallbackGroups).length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-gov-100 rounded-lg flex items-center justify-center">
              <span className="text-amber-600 text-sm">🛠️</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Playground</h2>
              <p className="text-xs text-gray-500">Pre-installed services available to you</p>
            </div>
          </div>
          <div className="space-y-8">
            {Object.entries(fallbackGroups).map(([category, mods]) => (
              <OldCategorySection category={category} key={category} oldModules={mods} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
