"use client";

import { MoonIcon, RefreshCcwIcon, SunIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAppRefresh } from "@/hooks/use-app-refresh";
import { useTheme } from "@/hooks/use-theme";
import { authClient, mapSessionUser } from "@/lib/auth-client";
import { LocaleSwitcher } from "./LanguageSwitcher";

/**
 * The desktop/browser app bar. Unchanged in appearance — it now reads theme and
 * refresh state from the shared hooks the mobile menu also uses, so a theme
 * flipped in one place is reflected in the other without a reload.
 */
export function Header() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);

  const { isDark, toggle: handleToggleTheme } = useTheme();
  const { isRefreshing, showSuccess, refresh: handleRefresh } = useAppRefresh();

  const handleLogout = async () => {
    await authClient.signOut();
    router.replace("/");
  };

  return (
    <header
      className={`safe-top sticky top-0 z-50 border-b transition-colors duration-300 ${
        isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 h-16">
          <div className="flex min-w-0 items-center">
            <div className="flex items-center gap-2">
              <Image
                alt="Sewa"
                className="h-6 w-auto shrink-0 sm:h-10"
                height={14}
                src="/sewa.svg"
                width={12}
              />

              <h1
                className={`truncate text-2xl font-bold leading-none ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                Sewa
              </h1>
            </div>
          </div>

          {/* Right: User Menu */}
          <div className="flex min-w-0 items-center gap-1 sm:gap-4">
            <LocaleSwitcher />

            <button
              className={`shrink-0 rounded-lg px-2 py-1.5 sm:px-3 transition ${
                isDark
                  ? "text-gray-300 hover:text-white hover:bg-gray-800"
                  : "text-gray-500 hover:text-gov-700 hover:bg-gov-50"
              }`}
              onClick={handleToggleTheme}
              title={isDark ? "Switch to light theme" : "Switch to dark theme"}
              type="button"
            >
              {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>

            {user && (
              <div className="flex min-w-0 items-center gap-1 sm:gap-3">
                <div className="min-w-0 max-w-40 text-right hidden sm:block">
                  <p
                    className={`truncate text-sm font-medium ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {user.fullName}
                  </p>

                  <p className={`truncate text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {user.email}
                  </p>
                </div>

                {!!session?.user?.image && (
                  <Image
                    alt={user.fullName}
                    className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-full border-2 ${
                      isDark ? "border-gray-600" : "border-gray-200"
                    }`}
                    height={36}
                    src={session.user.image}
                    unoptimized
                    width={36}
                  />
                )}

                <div className="relative flex shrink-0 items-center">
                  <button
                    className={`rounded-lg px-2 py-1.5 sm:px-3 transition disabled:opacity-70 ${
                      isDark
                        ? "text-gray-300 hover:text-white hover:bg-gray-800"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                    disabled={isRefreshing}
                    onClick={handleRefresh}
                    title="Refresh"
                    type="button"
                  >
                    <RefreshCcwIcon className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
                  </button>

                  {!!showSuccess && (
                    <div className="absolute top-full right-0 mt-2 whitespace-nowrap rounded-md bg-green-600 px-3 py-1 text-xs text-white shadow-lg animate-in fade-in duration-200">
                      ✓ App refreshed
                    </div>
                  )}
                </div>

                <button
                  className={`shrink-0 rounded-lg px-2 py-1.5 sm:px-3 transition ${
                    isDark
                      ? "text-gray-300 hover:text-red-400 hover:bg-red-950/40"
                      : "text-gray-500 hover:text-red-600 hover:bg-red-50"
                  }`}
                  onClick={handleLogout}
                  title="Sign Out"
                  type="button"
                >
                  🚪
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
