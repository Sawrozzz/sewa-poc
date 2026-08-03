"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient, mapSessionUser } from "@/lib/auth-client";
import { LocaleSwitcher } from "./LanguageSwitcher";
import { RefreshCcwIcon, SunIcon, MoonIcon } from "lucide-react";
import { privileged } from "@/platform/host-privileges";
import { usePlatform } from "@/platform";

export function Header() {
  const router = useRouter();
  const { appearance } = usePlatform();
  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDark, setIsDark] = useState(() => appearance.getTheme().mode === "dark");

  const handleToggleTheme = () => {
    appearance.toggleTheme();
    setIsDark(appearance.getTheme().mode === "dark");
  };

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/");
  };

  const handleRefresh = () => {
    if (isRefreshing) return;

    setIsRefreshing(true);

    const request = privileged.indexedDB?.deleteDatabase("sewa-plugin-cache") ?? null;

    const finish = () => {
      privileged.sessionStorage?.setItem("app-refreshed", "true");
      privileged.localStorage?.removeItem("sewa.onboarding.completed")
      router.push("/");

      setTimeout(() => {
        window.location.reload();
      }, 500);
    };

    if (!request) {
      finish();
      return;
    }

    request.onsuccess = finish;

    request.onerror = () => {
      console.error("Failed to delete IndexedDB.");
      finish();
    };

    request.onblocked = () => {
      console.warn("Database deletion blocked.");
      finish();
    };
  };

  useEffect(() => {
    if (privileged.sessionStorage?.getItem("app-refreshed")) {
      privileged.sessionStorage.removeItem("app-refreshed");

      setShowSuccess(true);

      setTimeout(() => {
        setShowSuccess(false);
      }, 2500);
    }
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gov-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg">🏛️</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">
                Citizen Portal
              </h1>
              <p className="text-[10px] text-gray-500 leading-tight">
                Government of Sri Lanka
              </p>
            </div>
          </div>

          {/* Right: User Menu */}
          <div className="flex items-center gap-4">
            <LocaleSwitcher />

            <button
              onClick={handleToggleTheme}
              className="text-sm text-gray-500 hover:text-gov-700 transition px-3 py-1.5 rounded-lg hover:bg-gov-50"
              title={isDark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>

            {user && (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">
                    {user.fullName}
                  </p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                {session?.user?.image && (
                  <img
                    src={session.user.image}
                    alt={user.fullName}
                    className="w-9 h-9 rounded-full border-2 border-gray-200"
                  />
                )}
                <div className="relative flex items-center">
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="text-sm text-gray-500 hover:text-gray-900 transition px-3 py-1.5 rounded-lg disabled:opacity-70"
                    title="Refresh"
                  >
                    <RefreshCcwIcon
                      className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`}
                    />
                  </button>

                  {showSuccess && (
                    <div className="absolute top-full mt-2 right-0 whitespace-nowrap rounded-md bg-green-600 px-3 py-1 text-xs text-white shadow-lg animate-in fade-in duration-200">
                      ✓ App refreshed
                    </div>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-500 hover:text-red-600 transition px-3 py-1.5 rounded-lg hover:bg-red-50"
                  title="Sign Out"
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
