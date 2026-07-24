'use client';

import { useMemo } from 'react';
import { authClient, mapSessionUser } from '@/lib/auth-client';
import { useMiniApps } from '@/lib/use-mini-apps';
import { MiniAppCard } from './MiniAppCard';
import type { ModuleManifest } from '@sewa/platform-contracts';

export function ModuleGrid() {
  const { data: session } = authClient.useSession();
  const { data: manifests = [], isLoading } = useMiniApps();
  const user = mapSessionUser(session?.user);

  const visibleModules = useMemo(() => {
    const userPermissions = user?.permissions ?? [];
    return manifests
      .filter((m) => m.isEnabled)
      .filter((m) =>
        m.requiredPermissions?.every((p) => userPermissions.includes(p))
      )
      .sort((a, b) => a.order - b.order);
  }, [manifests, user]);

  if (isLoading) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-200 border-dashed">
        <div className="w-10 h-10 border-4 border-gov-200 border-t-gov-600 rounded-full animate-spin mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">Loading Services...</h3>
      </div>
    );
  }

  if (visibleModules.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-200 border-dashed">
        <span className="text-4xl mb-3 block">📭</span>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Services Available</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          There are no services currently enabled.
        </p>
      </div>
    );
  }

  const grouped = visibleModules.reduce<Record<string, ModuleManifest[]>>((acc, m) => {
    const cat = m.category || 'Other';
    acc[cat] = acc[cat] || [];
    acc[cat].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([category, mods]) => (
        <section key={category}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-gov-500 rounded-full" />
            {category}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {mods.map((module) => (
              <MiniAppCard key={module.id} module={module} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
