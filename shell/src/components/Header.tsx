"use client";

import { useRouter } from "next/navigation";
import { authClient, mapSessionUser } from "@/lib/auth-client";
import { LocaleSwitcher } from "./LanguageSwitcher";

export function Header() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);

  const handleLogout = async () => {
    await authClient.signOut();
    router.push("/");
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gov-600 rounded-lg flex items-center justify-center">
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
