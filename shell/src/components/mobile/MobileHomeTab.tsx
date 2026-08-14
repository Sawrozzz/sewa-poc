"use client";

import { ChevronRightIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { authClient, mapSessionUser } from "@/lib/auth-client";
import { useFallbackMiniApps, useMiniAppCatalog } from "@/lib/use-mini-apps";
import { useTheme } from "@/lib/use-theme";
import { useMobileTabs } from "./MobileTabsContext";

/** How many apps the launcher shows before deferring to the Services tab. */
const LAUNCHER_SIZE = 8;

interface LauncherTile {
  key: string;
  name: string;
  icon?: string;
  iconUrl?: string;
  color?: string;
  href: string;
}

function AppTile({ isDark, tile }: { isDark: boolean; tile: LauncherTile }) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);

  return (
    <button
      className="flex flex-col items-center gap-2 transition active:scale-95"
      onClick={() => router.push(tile.href)}
      type="button"
    >
      <span
        className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border text-2xl shadow-sm ${
          isDark ? "border-gray-800 bg-gray-900" : "border-gray-200/80 bg-white"
        }`}
        style={tile.color ? { backgroundColor: `${tile.color}18` } : undefined}
      >
        {tile.iconUrl && !imgError ? (
          // biome-ignore lint/performance/noImgElement: <icons come from arbitrary registry origins>
          <img
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
            src={tile.iconUrl}
          />
        ) : (
          (tile.icon ?? (
            <span className="text-lg font-bold text-gov-700">
              {tile.name.charAt(0).toUpperCase()}
            </span>
          ))
        )}
      </span>

      <span
        className={`line-clamp-2 w-full text-center text-[11px] leading-tight ${
          isDark ? "text-gray-300" : "text-gray-700"
        }`}
      >
        {tile.name}
      </span>
    </button>
  );
}

/**
 * The Home tab — a launcher, not a catalogue. It shows the citizen a greeting
 * and the first {@link LAUNCHER_SIZE} services as tappable icons; browsing the
 * full list is the Services tab's job, so the two never render the same long
 * list twice.
 */
export function MobileHomeTab() {
  const t = useTranslations("HomePage");
  const tNav = useTranslations("MobileNav");
  const tHome = useTranslations("MobileHome");

  const { isDark } = useTheme();
  const { setActiveTab } = useMobileTabs();

  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);
  const userPermissions = useMemo(() => user?.permissions ?? [], [user]);

  // Same query options as `ModuleGrid` and the Services tab, so all three read
  // one cache entry rather than each firing their own request.
  const { miniApps, isLoading } = useMiniAppCatalog();
  const fallbackModules = useFallbackMiniApps();

  const tiles = useMemo<LauncherTile[]>(() => {
    const registry = miniApps.map((app) => ({
      key: `registry:${app.id ?? app.miniAppId}`,
      name: app.displayName ?? app.miniAppId,
      iconUrl: app.iconUrl ?? undefined,
      href: `/${app.miniAppId}?source=registry`,
    }));

    const fallback = fallbackModules
      .filter((m) => m.isEnabled)
      .filter((m) => m.requiredPermissions?.every((p) => userPermissions.includes(p)))
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        key: `fallback:${m.id}`,
        name: m.name,
        icon: m.icon,
        color: m.color,
        href: `/${m.id}`,
      }));

    return [...registry, ...fallback].slice(0, LAUNCHER_SIZE);
  }, [miniApps, fallbackModules, userPermissions]);

  return (
    <div className="space-y-6 px-4 py-4">
      {/* Greeting */}
      <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-gov-800 via-gov-900 to-gov-950 p-5 text-white shadow-lg shadow-gov-300/30">
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/5" />

        <div className="relative">
          <p className="text-lg font-bold leading-tight">{t("welcome_text")}</p>

          <p className="mt-1 text-xs leading-relaxed text-gov-200">{t("services_description")}</p>

          <div className="mt-4 flex items-center gap-2 text-[11px] text-gov-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {tHome("secure_note")}
          </div>
        </div>
      </section>

      {/* Launcher */}
      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className={`text-sm font-bold ${isDark ? "text-gray-100" : "text-gray-900"}`}>
            {tHome("your_services")}
          </h2>

          <button
            className="flex items-center gap-0.5 text-xs font-semibold text-gov-700"
            onClick={() => setActiveTab("services")}
            type="button"
          >
            {tHome("see_all")}
            <ChevronRightIcon size={14} />
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-4 gap-x-3 gap-y-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div className="flex flex-col items-center gap-2" key={i}>
                <div className="h-14 w-14 animate-pulse rounded-2xl bg-gray-200" />
                <div className="h-2.5 w-10 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : tiles.length > 0 ? (
          <div className="grid grid-cols-4 gap-x-3 gap-y-5">
            {tiles.map((tile) => (
              <AppTile isDark={isDark} key={tile.key} tile={tile} />
            ))}
          </div>
        ) : (
          <div
            className={`rounded-2xl border px-6 py-10 text-center text-sm ${
              isDark
                ? "border-gray-800 bg-gray-900 text-gray-400"
                : "border-gray-200 bg-white text-gray-500"
            }`}
          >
            {tHome("no_services")}
          </div>
        )}
      </section>

      {/* Shortcut into the full list */}
      <button
        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.99] ${
          isDark ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"
        }`}
        onClick={() => setActiveTab("services")}
        type="button"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gov-100 text-base">
          📦
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm font-semibold ${isDark ? "text-gray-100" : "text-gray-900"}`}
          >
            {tNav("services")}
          </span>

          <span className={`block text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {tHome("browse_all")}
          </span>
        </span>

        <ChevronRightIcon className={isDark ? "text-gray-600" : "text-gray-300"} size={18} />
      </button>
    </div>
  );
}
