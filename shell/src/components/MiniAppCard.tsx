"use client";

import type { ModuleManifest, OldModuleManifest } from "@sewa/host-platform";
import { useRouter } from "next/navigation";

interface MiniAppCardProps {
  oldModule?: OldModuleManifest;
  newModule?: ModuleManifest;
}

export function OldMiniAppCard({ oldModule }: MiniAppCardProps) {
  const router = useRouter();

  return (
    <button
      className="group bg-white rounded-xl border border-gray-200 hover:border-gov-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-6 flex flex-col text-left relative overflow-hidden scroll-mt-40"
      id={oldModule?.id}
      onClick={() => router.push(`/${oldModule?.id}`)}
      type="button"
    >
      <div
        className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ backgroundColor: oldModule?.color }}
      />

      <div className="flex items-start justify-between mb-4 relative">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-sm group-hover:shadow-md transition-shadow"
          style={{ backgroundColor: `${oldModule?.color}18` }}
        >
          {oldModule?.icon}
        </div>
        <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded-md">
          v{oldModule?.version}
        </span>
      </div>

      <h3 className="text-base font-semibold text-gray-900 group-hover:text-gov-700 transition mb-1.5 relative">
        {oldModule?.name}
      </h3>
      <p className="text-sm text-gray-500 flex-1 mb-4 line-clamp-2 relative leading-relaxed">
        {oldModule?.description}
      </p>

      <div className="flex items-center justify-between relative pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-md">
            {oldModule?.vendor}
          </span>
          {!!oldModule?.category && (
            <span className="text-xs text-gray-400">{oldModule?.category}</span>
          )}
        </div>
        <span className="text-sm font-medium text-gov-800 group-hover:text-gov-900 transition flex items-center gap-1">
          Open
          <svg
            className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <title>Open</title>
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </button>
  );
}
