"use client";

import type { OldModuleManifest } from "@sewa/host-platform";
import { ChevronRightIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { authClient, mapSessionUser } from "@/lib/auth-client";
import { isFloatingMiniApp } from "@/lib/floating-mini-app";
import type { ResolvedMiniApp } from "@/lib/merge-mini-app";
import {
  useFallbackMiniApps,
  useMiniAppCatalog,
  useMiniApps,
  useRefreshMiniApps,
} from "@/lib/use-mini-apps";
import { useTheme } from "@/lib/use-theme";

/** One row in the list — the phone equivalent of a card in `ModuleGrid`. */
interface ServiceRow {
  key: string;
  name: string;
  description?: string;
  version?: string;
  /** Emoji for pre-installed apps, remote image for registry ones. */
  icon?: string;
  iconUrl?: string;
  color?: string;
  href: string;
}

function toRegistryRow(app: ResolvedMiniApp): ServiceRow {
  return {
    key: `registry:${app.id ?? app.miniAppId}`,
    name: app.displayName ?? app.miniAppId,
    description: app.description ?? undefined,
    version: app.version,
    iconUrl: app.iconUrl ?? undefined,
    // Mirrors `NewMiniAppCard`: a registry app can share its id with a
    // pre-installed one, so the source has to be explicit in the URL.
    href: `/${app.miniAppId}?source=registry`,
  };
}

function toFallbackRow(mod: OldModuleManifest): ServiceRow {
  return {
    key: `fallback:${mod.id}`,
    name: mod.name,
    description: mod.description,
    version: mod.version,
    icon: mod.icon,
    color: mod.color,
    href: `/${mod.id}`,
  };
}

function matches(row: ServiceRow, term: string) {
  if (!term) return true;
  const haystack = `${row.name} ${row.description ?? ""}`.toLowerCase();
  return haystack.includes(term);
}

function ServiceListRow({ isDark, row }: { isDark: boolean; row: ServiceRow }) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);

  return (
    <li>
      <button
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:scale-[0.99] ${
          isDark ? "active:bg-gray-800" : "active:bg-gov-50"
        }`}
        id={`mobile-${row.key}`}
        onClick={() => router.push(row.href)}
        type="button"
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xl ${
            isDark ? "bg-gray-800" : "bg-gray-50"
          }`}
          style={row.color ? { backgroundColor: `${row.color}18` } : undefined}
        >
          {row.iconUrl && !imgError ? (
            // biome-ignore lint/performance/noImgElement: <icons come from arbitrary registry origins>
            <img
              alt=""
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
              src={row.iconUrl}
            />
          ) : (
            (row.icon ?? row.name.charAt(0).toUpperCase())
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-semibold ${
              isDark ? "text-gray-100" : "text-gray-900"
            }`}
          >
            {row.name}
          </span>

          <span
            className={`mt-0.5 block truncate text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
          >
            {row.description || (row.version ? `v${row.version}` : "")}
          </span>
        </span>

        <ChevronRightIcon className={isDark ? "text-gray-600" : "text-gray-300"} size={18} />
      </button>
    </li>
  );
}

function SkeletonRow() {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-gray-200" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
      </div>
    </li>
  );
}

/**
 * The Services tab: the same catalog the desktop grid shows, as a scannable
 * single-column list with a search field. It calls `useMiniAppCatalog()` with
 * the same (default) options as `ModuleGrid`, so both read one React Query
 * cache entry — mounting this tab costs no extra requests.
 */
export function MobileServicesTab() {
  const t = useTranslations("MobileServices");
  const { isDark } = useTheme();
  const [term, setTerm] = useState("");

  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);
  const userPermissions = useMemo(() => user?.permissions ?? [], [user]);

  const refreshMiniApps = useRefreshMiniApps();
  const fallbackModules = useFallbackMiniApps();
  const {
    miniApps,
    isLoading,
    isError: catalogFailed,
    error: catalogError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMiniAppCatalog();
  const { isError: manifestFailed, error: manifestError } = useMiniApps();

  const isError = manifestFailed || catalogFailed;
  const error = manifestFailed ? manifestError : catalogError;

  const search = term.trim().toLowerCase();

  // The chat app is reachable from the floating bubble on this shell, so it is
  // not also listed here.
  const registryRows = useMemo(
    () =>
      miniApps
        .filter((app) => !isFloatingMiniApp(app.miniAppId))
        .map(toRegistryRow)
        .filter((row) => matches(row, search)),
    [miniApps, search],
  );

  const fallbackRows = useMemo(
    () =>
      fallbackModules
        .filter((m) => m.isEnabled)
        .filter((m) => m.requiredPermissions?.every((p) => userPermissions.includes(p)))
        .sort((a, b) => a.order - b.order)
        .map(toFallbackRow)
        .filter((row) => matches(row, search)),
    [fallbackModules, userPermissions, search],
  );

  const isEmpty = !isLoading && !isError && registryRows.length === 0 && fallbackRows.length === 0;

  const cardClass = `overflow-hidden rounded-2xl border ${
    isDark ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"
  }`;
  const dividerClass = isDark ? "divide-gray-800" : "divide-gray-100";

  return (
    <div className="px-4 py-4">
      <div className="relative mb-4">
        <SearchIcon
          className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${
            isDark ? "text-gray-500" : "text-gray-400"
          }`}
          size={18}
        />

        <input
          className={`w-full rounded-xl border py-3 pl-11 pr-4 text-sm outline-none transition focus:border-gov-500 focus:ring-2 focus:ring-gov-200 ${
            isDark
              ? "border-gray-800 bg-gray-900 text-gray-100 placeholder:text-gray-500"
              : "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400"
          }`}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("search_placeholder")}
          type="search"
          value={term}
        />
      </div>

      {isLoading ? (
        <ul className={`${cardClass} divide-y ${dividerClass}`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </ul>
      ) : isError ? (
        <div className={`${cardClass} px-6 py-10 text-center`}>
          <div className="mb-3 text-4xl">
            {error?.message?.toLowerCase().includes("signature") ? "🔒" : "📡"}
          </div>

          <p className={`mb-5 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {error?.message || t("load_failed")}
          </p>

          <button
            className="rounded-lg bg-gov-500 px-5 py-2.5 text-sm font-medium text-gov-950"
            onClick={() => refreshMiniApps()}
            type="button"
          >
            {t("try_again")}
          </button>
        </div>
      ) : isEmpty ? (
        <div className={`${cardClass} px-6 py-12 text-center`}>
          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {search ? t("no_results", { term: term.trim() }) : t("empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {registryRows.length > 0 && (
            <section>
              <h2
                className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${
                  isDark ? "text-gray-500" : "text-gray-500"
                }`}
              >
                {t("available")}
              </h2>

              <ul className={`${cardClass} divide-y ${dividerClass}`}>
                {registryRows.map((row) => (
                  <ServiceListRow isDark={isDark} key={row.key} row={row} />
                ))}
              </ul>

              {/* Deliberately a button, not the desktop grid's intersection
                  observer: this list shares the document scroll with the Home
                  tab, and an offscreen sentinel would keep paging while the
                  user is somewhere else. */}
              {!!hasNextPage && (
                <button
                  className={`mt-3 w-full rounded-xl border py-3 text-sm font-medium transition disabled:opacity-60 ${
                    isDark
                      ? "border-gray-800 bg-gray-900 text-gray-200"
                      : "border-gray-200 bg-white text-gov-800"
                  }`}
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                  type="button"
                >
                  {isFetchingNextPage ? t("loading") : t("load_more")}
                </button>
              )}
            </section>
          )}

          {fallbackRows.length > 0 && (
            <section>
              <h2
                className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${
                  isDark ? "text-gray-500" : "text-gray-500"
                }`}
              >
                {t("playground")}
              </h2>

              <ul className={`${cardClass} divide-y ${dividerClass}`}>
                {fallbackRows.map((row) => (
                  <ServiceListRow isDark={isDark} key={row.key} row={row} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
