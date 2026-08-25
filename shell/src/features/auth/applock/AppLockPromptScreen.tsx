"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Shown once, the first time a citizen reaches the app after signing in:
 * asks whether they want a 4-digit PIN required on future app opens. Skipping
 * is fine — App Lock can still be turned on later from the Menu tab.
 */
export function AppLockPromptScreen({
  onEnableAction,
  onSkipAction,
}: {
  onEnableAction: () => void;
  onSkipAction: () => void;
}) {
  const t = useTranslations("AppLock");

  return (
    <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-gov-950 via-gov-900 to-gov-800 p-4">
      <div className="w-full max-w-md animate-fade-in flex flex-col items-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
          <LockIcon className="text-white" size={36} />
        </div>

        <h1 className="mt-8 text-2xl font-bold text-white leading-tight">{t("prompt_title")}</h1>
        <p className="mt-3 text-sm text-gov-300 leading-relaxed max-w-sm">
          {t("prompt_description")}
        </p>

        <button
          className="mt-10 w-full py-3.5 bg-white text-gov-800 font-semibold rounded-xl shadow-lg shadow-gov-950/40 hover:bg-gov-50 active:scale-[0.99] transition"
          onClick={onEnableAction}
          type="button"
        >
          {t("prompt_enable")}
        </button>

        <button
          className="mt-3 w-full py-3.5 text-gov-300 font-medium hover:text-white transition"
          onClick={onSkipAction}
          type="button"
        >
          {t("prompt_skip")}
        </button>
      </div>
    </div>
  );
}
