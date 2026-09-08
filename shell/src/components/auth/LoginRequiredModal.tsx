"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function LoginRequiredModal({ isDark }: { isDark: boolean }) {
  const t = useTranslations("LoginRequired");
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const color = isDark ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white";
  const textColor = isDark ? "text-white" : "text-gray-900";
  const subTextColor = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <div
      className={`fixed inset-0 z-100 flex items-center justify-center p-4 ${isDark ? "bg-black/70" : "bg-black/40"}`}
    >
      <div
        aria-label="Close"
        aria-modal="true"
        className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl animate-fade-in ${color}`}
        role="dialog"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="text-3xl">🔒</div>
          <button
            aria-label="Close"
            className={`shrink-0 rounded-md p-1 transition ${
              isDark ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100"
            }`}
            onClick={() => setOpen(false)}
            type="button"
          >
            <XIcon size={18} />
          </button>
        </div>

        <h3 className={`mb-1.5 text-lg font-bold ${textColor}`}>{t("title")}</h3>
        <p className={`mb-6 text-sm leading-relaxed ${subTextColor}`}>{t("body")}</p>

        <div className="flex gap-3">
          <button
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              isDark
                ? "bg-gov-500 text-gov-950 hover:bg-gov-400"
                : "bg-gov-600 text-white hover:bg-gov-700"
            }`}
            onClick={() => {
              try {
                window.localStorage.removeItem("sewa.guestMode");
              } catch {
                // ignore
              }
              window.location.assign("/");
            }}
            type="button"
          >
            Log in
          </button>
          <button
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              isDark
                ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            onClick={() => setOpen(false)}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
