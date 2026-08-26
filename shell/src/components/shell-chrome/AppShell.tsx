"use client";

import { useTranslations } from "next-intl";
import { GlobalSearchBar } from "@/components/catalog/GlobalSearchBar";
import { ModuleGrid } from "@/components/catalog/ModuleGrid";
import { MobileShell } from "@/components/mobile/MobileShell";
import { MobileTabsProvider } from "@/components/mobile/MobileTabsContext";
import { authClient, mapSessionUser } from "@/features/auth/auth-client";
import { getGreeting } from "@/shared/lib";
import { Header } from "./Header";

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

  const greeting = t(`greetings.${getGreeting()}`);
  const { data: session } = authClient.useSession();

  const user = mapSessionUser(session?.user);

  const name = user?.fullName || "Citizen";

  return (
    <div className="max-md:hidden">
      <Header />
      <main className="safe-bottom max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h2 className="text-2xl font-bold tracking-tight pb-2">
          {t("welcome_text", { greeting, name })}
        </h2>
        <div className="below-header sticky z-40 py-4">
          <GlobalSearchBar />
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
