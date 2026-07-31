"use client";

import { useTranslations } from "next-intl";
import { WelcomeIllustration } from "./WelcomeIllustration";

export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const t = useTranslations("Welcome");

  return (
    <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-gov-950 via-gov-900 to-gov-800 p-4">
      <div className="w-full max-w-md animate-fade-in flex flex-col items-center text-center">
        <WelcomeIllustration className="w-full max-w-xs sm:max-w-sm" />

        <h1 className="mt-8 text-3xl font-bold text-white leading-tight">
          {t("title")}
        </h1>
        <p className="mt-3 text-sm text-gov-300 leading-relaxed max-w-sm">
          {t("subtitle")}
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="mt-10 w-full py-3.5 bg-white text-gov-800 font-semibold rounded-xl shadow-lg shadow-gov-950/40 hover:bg-gov-50 active:scale-[0.99] transition"
        >
          {t("continue")}
        </button>

        <div className="mt-8 flex items-center gap-2">
          <span className="w-6 h-1.5 rounded-full bg-white" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
        </div>
      </div>
    </div>
  );
}
