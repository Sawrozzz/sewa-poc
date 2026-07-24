"use client";

import { authClient, mapSessionUser } from "@/lib/auth-client";
import { ModuleGrid } from "./ModuleGrid";
import { Header } from "./Header";
import { useTranslations } from "next-intl";

export function AppShell() {
  const t = useTranslations("HomePage");
  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 bg-gradient-to-r from-gov-600 to-gov-800 rounded-xl p-6 text-white">
          <h2 className="text-xl font-bold mb-1">
              {t("welcome_text")}
          </h2>
          <p className="text-gov-200 text-sm">
            {t("services_description")}
          </p>
        </div>

        <ModuleGrid />

        <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-xs text-gray-500 justify-items-start">
          <p>
            Government Citizen Super App v1.0 — Modules are controlled by the{" "}
            <a
              href="http://localhost:4000"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gov-600 hover:underline font-medium"
            >
              Module Management Dashboard
            </a>
          </p>
          <p className="mt-1">
            National ID: {user?.nationalId} · Last login:{" "}
            {new Date().toLocaleString()}
          </p>
        </footer>
      </main>
    </div>
  );
}
