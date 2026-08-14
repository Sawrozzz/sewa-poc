"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MiniAppListItem } from "@/types/manifest";

interface MiniAppCardProps {
  newModule: MiniAppListItem;
}

export function NewMiniAppCard({ newModule }: MiniAppCardProps) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);

  return (
    <button
      className="group relative flex flex-col text-left w-full h-full bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-xl hover:border-gov-400 hover:-translate-y-1 transition-all duration-300 ease-out overflow-hidden focus:outline-none focus:ring-2 focus:ring-gov-500 focus:ring-offset-2"
      id={newModule.miniAppId}
      // `source=registry` picks the signed-manifest loading path. A registry
      // mini app can share its id with a pre-installed one, and the two are
      // loaded and cached differently, so the route has to say which is meant.
      onClick={() => router.push(`/${newModule.miniAppId}?source=registry`)}
      type="button"
    >
      {/* Decorative Gradient Background Accent */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-28 h-28 rounded-full bg-linear-to-br from-gov-200/40 to-amber-200/40 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Header: App Icon & Version Badge */}
      <div className="flex items-start justify-between mb-4 w-full">
        <div className="relative w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shadow-xs group-hover:scale-105 group-hover:shadow-md transition-all duration-300 shrink-0">
          {newModule.iconUrl && !imgError ? (
            // biome-ignore lint/performance/noImgElement: <icons come from arbitrary registry origins>
            <img
              alt={`${newModule.displayName ?? newModule.miniAppId} icon`}
              className="w-full h-full object-cover rounded-xl"
              onError={() => setImgError(true)}
              src={newModule.iconUrl}
            />
          ) : (
            <span className="text-xl font-bold text-gov-700 select-none">
              {(newModule.displayName ?? newModule.miniAppId).charAt(0).toUpperCase() || "📦"}
            </span>
          )}
        </div>

        {!!newModule?.version && (
          <span className="text-[11px] font-mono text-gray-500 bg-gray-100/80 group-hover:bg-gov-50 group-hover:text-gov-700 px-2.5 py-1 rounded-full border border-gray-200/50 transition-colors duration-200">
            v{newModule.version}
          </span>
        )}
      </div>

      {/* Content: Title & Description */}
      <div className="flex-1 mb-5">
        <h3 className="text-base font-bold text-gray-900 group-hover:text-gov-800 transition-colors duration-200 mb-1.5 line-clamp-1">
          {newModule.displayName ?? newModule.miniAppId}
        </h3>
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
          {newModule?.description || "No description provided for this service."}
        </p>
      </div>

      {/* Footer: Metadata & Call to Action */}
      <div className="mt-auto pt-3.5 border-t border-gray-100 flex items-center justify-between w-full">
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          {!!newModule.backingAgencyId && (
            <span className="text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-200/60 px-2 py-0.5 rounded-md truncate max-w-[120px]">
              {newModule.backingAgencyId}
            </span>
          )}
          {!!newModule.category && (
            <span className="text-[11px] text-gray-400 font-medium truncate">
              • {newModule.category}
            </span>
          )}
        </div>

        <span className="text-xs font-semibold text-gov-700 group-hover:text-gov-900 transition-colors flex items-center gap-1 shrink-0">
          Open
          <svg
            className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
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
