"use client";

import { ModuleGrid } from "./ModuleGrid";
import { Header } from "./Header";
import { useTranslations } from "next-intl";

export function AppShell() {
  const t = useTranslations("HomePage");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-10 bg-gradient-to-br from-gov-600 via-gov-700 to-gov-900 rounded-2xl p-8 text-white shadow-xl shadow-gov-200/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full -ml-20 -mb-20" />
          <div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-10 hidden md:block">
            <svg width="200" height="200" viewBox="0 0 200 200" fill="none">
              <rect x="20" y="30" width="160" height="140" rx="12" stroke="white" strokeWidth="2" />
              <rect x="35" y="45" width="60" height="40" rx="6" stroke="white" strokeWidth="1.5" />
              <rect x="105" y="45" width="60" height="40" rx="6" stroke="white" strokeWidth="1.5" />
              <rect x="35" y="100" width="60" height="40" rx="6" stroke="white" strokeWidth="1.5" />
              <rect x="105" y="100" width="60" height="40" rx="6" stroke="white" strokeWidth="1.5" />
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
                  <h2 className="text-2xl font-bold tracking-tight">
                    {t("welcome_text")}
                  </h2>
                  <p className="text-gov-200 text-sm">
                    {t("services_description")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-6">
                <div className="flex items-center gap-2 text-gov-200 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                  All services are secure and encrypted
                </div>
                <div className="flex items-center gap-2 text-gov-200 text-xs">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shadow-lg shadow-blue-400/50" />
                  Real-time updates
                </div>
              </div>
            </div>
          </div>
        </div>

        <ModuleGrid />

        <footer className="mt-12 pt-8 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-gov-600 rounded-md flex items-center justify-center">
                  <span className="text-white text-xs">🏛️</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">Citizen Portal</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Government Citizen Super App v1.0
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Resources</h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="http://localhost:4000"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gov-600 hover:text-gov-700 hover:underline transition"
                  >
                    Module Management Dashboard
                  </a>
                </li>
              </ul>
            </div>
            <div className="text-right md:text-left">
              <p className="text-xs text-gray-500">
                Last login: {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}