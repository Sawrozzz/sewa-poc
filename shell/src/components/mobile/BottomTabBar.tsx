"use client";

import { HomeIcon, LayoutGridIcon, MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/hooks/use-theme";
import type { MobileTab } from "./MobileTabsContext";
import { useMobileTabs } from "./MobileTabsContext";

const TABS: { id: MobileTab; Icon: typeof HomeIcon; labelKey: string }[] = [
  { id: "home", Icon: HomeIcon, labelKey: "home" },
  { id: "services", Icon: LayoutGridIcon, labelKey: "services" },
  { id: "menu", Icon: MenuIcon, labelKey: "menu" },
];

/**
 * Phone-only bottom navigation. `md:hidden` keeps it off the browser layout
 * entirely; `.safe-bottom` reserves the home-indicator inset once installed.
 */
export function BottomTabBar() {
  const t = useTranslations("MobileNav");
  const { activeTab, setActiveTab } = useMobileTabs();
  const { isDark } = useTheme();

  return (
    <nav
      aria-label={t("label")}
      className={`safe-bottom fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-md md:hidden ${
        isDark ? "border-gray-800 bg-gray-900/90" : "border-gray-200 bg-white/90"
      }`}
    >
      <ul className="grid grid-cols-3">
        {TABS.map(({ id, Icon, labelKey }) => {
          const isActive = activeTab === id;

          return (
            <li key={id}>
              <button
                aria-current={isActive ? "page" : undefined}
                className="flex w-full flex-col items-center gap-1 px-2 pb-2 pt-2.5 transition-colors"
                onClick={() => setActiveTab(id)}
                type="button"
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                    isActive ? (isDark ? "bg-gov-500/20" : "bg-gov-100") : "bg-transparent"
                  }`}
                >
                  <Icon
                    className={
                      isActive
                        ? isDark
                          ? "text-gov-400"
                          : "text-gov-800"
                        : isDark
                          ? "text-gray-500"
                          : "text-gray-400"
                    }
                    size={20}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                </span>

                <span
                  className={`text-[11px] leading-none ${
                    isActive
                      ? isDark
                        ? "font-semibold text-gov-400"
                        : "font-semibold text-gov-800"
                      : isDark
                        ? "text-gray-500"
                        : "text-gray-500"
                  }`}
                >
                  {t(labelKey)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
