"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ModuleManifest } from "@sewa/platform-contracts";

interface MiniAppCardProps {
  module: ModuleManifest;
}

export function MiniAppCard({ module }: MiniAppCardProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/mini-app/${module.id}`)}
      className="group bg-white rounded-xl border border-gray-200 hover:border-gov-300 hover:shadow-lg transition-all duration-200 p-6 flex flex-col"
    >
      <div className="flex items-start justify-between mb-4">
        <span
          className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
          style={{ backgroundColor: `${module.color}15` }}
        >
          {module.icon}
        </span>
        <span className="text-[10px] text-gray-400 font-mono">
          v{module.version}
        </span>
      </div>

      <h3 className="text-base font-semibold text-gray-900 group-hover:text-gov-700 transition mb-1">
        {module.name}
      </h3>
      <p className="text-sm text-gray-500 flex-1 mb-4 line-clamp-2">
        {module.description}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{module.vendor}</span>
        <span className="text-sm font-medium text-gov-600 group-hover:text-gov-700 transition">
          Open →
        </span>
      </div>
    </button>
  );
}
