"use client";

import { RefreshCcwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAppRefresh } from "@/lib/use-app-refresh";
import { useTheme } from "@/lib/use-theme";
import { useMobileTabs } from "./MobileTabsContext";

/**
 * Phone-only app bar. Replaces the desktop `Header` below `md` — the controls
 * that header packs into its right side (language, theme, sign out) live in the
 * Menu tab here, which is what makes the row fit a phone. Refresh keeps a place
 * on the bar because it is the one action you reach for while looking at a
 * stale list, not while browsing settings.
 */
export function MobileTopBar() {
  const t = useTranslations("MobileNav");
  const { activeTab } = useMobileTabs();
  const { isDark } = useTheme();
  const { isRefreshing, showSuccess, refresh } = useAppRefresh();

  const title = activeTab === "home" ? t("app_name") : t(activeTab);

  return (
    <header
      className={`safe-top sticky top-0 z-40 border-b backdrop-blur-md md:hidden ${
        isDark ? "border-gray-800 bg-gray-900/90" : "border-gray-200 bg-white/90"
      }`}
    >
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gov-500">
            <span className="text-base">🏛️</span>
          </div>

          <h1
            className={`truncate text-base font-bold leading-tight ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            {title}
          </h1>
        </div>

        <div className="relative flex shrink-0 items-center">
          <button
            aria-label={t("refresh")}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition disabled:opacity-60 ${
              isDark ? "text-gray-300 active:bg-gray-800" : "text-gray-500 active:bg-gov-50"
            }`}
            disabled={isRefreshing}
            onClick={refresh}
            type="button"
          >
            <RefreshCcwIcon className={isRefreshing ? "animate-spin" : ""} size={19} />
          </button>

          {!!showSuccess && (
            <div className="absolute right-0 top-full mt-1 whitespace-nowrap rounded-md bg-green-600 px-2.5 py-1 text-xs text-white shadow-lg">
              {t("refreshed")}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
