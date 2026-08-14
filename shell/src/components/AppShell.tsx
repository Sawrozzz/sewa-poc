"use client";

import { useTranslations } from "next-intl";
import { Header } from "./Header";
import { ModuleGrid } from "./ModuleGrid";
import { MobileShell, MobileTabsProvider } from "./mobile/MobileShell";

/**
 * The portal, in two mutually exclusive faces.
 *
 * `DesktopShell` is the browser layout exactly as it was; `MobileShell` is a
 * tabbed, native-feeling shell for phones and the installed PWA. Which one you
 * see is decided purely by CSS (`max-md:hidden` / `md:hidden`) at the `md`
 * breakpoint, so neither can affect the other's rendering.
 */
export function AppShell() {
  return (
    <MobileTabsProvider>
      <div className="mobile-surface min-h-screen bg-linear-to-br from-gov-50 via-white to-gov-50">
        <DesktopShell />
        <MobileShell />
      </div>
    </MobileTabsProvider>
  );
}

function DesktopShell() {
  const t = useTranslations("HomePage");

  return (
    <div className="max-md:hidden">
      <Header />

      <div className="below-header sticky z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <input type="text" />
        </div>
      </div>

      <main className="safe-bottom max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-10 bg-linear-to-br from-gov-800 via-gov-900 to-gov-950 rounded-2xl p-8 text-white shadow-xl shadow-gov-300/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full -ml-20 -mb-20" />
          <div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-10 hidden md:block">
            <svg fill="none" height="200" viewBox="0 0 200 200" width="200">
              <title>Search</title>
              <rect height="140" rx="12" stroke="white" strokeWidth="2" width="160" x="20" y="30" />
              <rect height="40" rx="6" stroke="white" strokeWidth="1.5" width="60" x="35" y="45" />
              <rect height="40" rx="6" stroke="white" strokeWidth="1.5" width="60" x="105" y="45" />
              <rect height="40" rx="6" stroke="white" strokeWidth="1.5" width="60" x="35" y="100" />
              <rect
                height="40"
                rx="6"
                stroke="white"
                strokeWidth="1.5"
                width="60"
                x="105"
                y="100"
              />
              <circle cx="50" cy="65" r="8" stroke="white" strokeWidth="1.5" />
              <circle cx="120" cy="65" r="8" stroke="white" strokeWidth="1.5" />
              <circle cx="50" cy="120" r="8" stroke="white" strokeWidth="1.5" />
              <circle cx="120" cy="120" r="8" stroke="white" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="relative flex items-center justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <span className="text-2xl">🏛️</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">{t("welcome_text")}</h2>
                  <p className="text-gov-200 text-sm">{t("services_description")}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-6">
                <div className="flex items-center gap-2 text-gov-200 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                  All services are secure and encrypted
                </div>
                <div className="flex items-center gap-2 text-gov-200 text-xs">
                  <span className="w-2 h-2 rounded-full bg-gov-400 shadow-lg shadow-gov-400/50" />
                  Real-time updates
                </div>
              </div>
            </div>
          </div>
        </div>

        <ModuleGrid />

        <footer className="mt-12 pt-8 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-gov-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-xs">🏛️</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">Citizen Portal</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Government Citizen Super App v1.0
              </p>
            </div>
            <div className="text-right md:text-left">
              <p className="text-xs text-gray-500">Last login: {new Date().toLocaleString()}</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
