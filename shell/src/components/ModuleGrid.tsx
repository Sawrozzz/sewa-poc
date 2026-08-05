'use client';

import { useMemo } from 'react';

import { MiniAppCard } from './MiniAppCard';

import type { ModuleManifest } from '@sewa/host-platform';

import { authClient, mapSessionUser } from '@/lib/auth-client';
import { useMiniApps, useFallbackMiniApps } from '@/lib/use-mini-apps';

function filterByPermission(mods: ModuleManifest[], permissions: string[]) {
  return mods
    .filter((m) => m.isEnabled)
    .filter((m) => m.requiredPermissions?.every((p) => permissions.includes(p)))
    .sort((a, b) => a.order - b.order);
}

function groupByCategory(mods: ModuleManifest[]) {
  return mods.reduce<Record<string, ModuleManifest[]>>((acc, m) => {
    const cat = m.category || 'Other';
    acc[cat] = acc[cat] || [];
    acc[cat].push(m);
    return acc;
  }, {});
}

function CategorySection({ category, modules }: { category: string; modules: ModuleManifest[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-gov-500 rounded-full" />
        {category}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {modules.map((mod) => (
          <MiniAppCard key={mod.id} module={mod} />
        ))}
      </div>
    </section>
  );
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
  const userPermissions = user?.permissions ?? [];

  const fallbackModules = useFallbackMiniApps();
  const { data: apiModules, isLoading, isError, error, refetch } = useMiniApps();

  const filteredFallback = useMemo(
    () => filterByPermission(fallbackModules, userPermissions),
    [fallbackModules, userPermissions],
  );

  const filteredApi = useMemo(
    () => (apiModules ? filterByPermission(apiModules, userPermissions) : []),
    [apiModules, userPermissions],
  );

  const fallbackGroups = useMemo(() => groupByCategory(filteredFallback), [filteredFallback]);
  const apiGroups = useMemo(() => groupByCategory(filteredApi), [filteredApi]);
  const hasApiModules = Object.keys(apiGroups).length > 0;

  return (
    <div className="space-y-10">
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
              <CategorySection key={category} category={category} modules={mods} />
            ))}
          </div>
        </div>
      )}

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
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        ) : isError ? (
          <div className="text-center py-12 bg-white rounded-xl border border-red-100">
            <div className="text-5xl mb-4">📡</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Could Not Load Services</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
              {error?.message || 'Unable to fetch services from the platform. Please check your connection.'}
            </p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gov-500 text-gov-950 rounded-lg hover:bg-gov-600 transition text-sm font-medium"
            >
              <span>🔄</span>
              Try Again
            </button>
          </div>
        ) : !hasApiModules ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Additional Services</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              No additional services are available from the platform at the moment. Check back later.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(apiGroups).map(([category, mods]) => (
              <CategorySection key={category} category={category} modules={mods} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}