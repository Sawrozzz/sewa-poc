"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  localeEnglishLabels,
  localeLabels,
  localeWelcome,
  locales,
  type Locale,
} from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

export function LanguageScreen({ onContinueAction }: { onContinueAction: () => void }) {
  const t = useTranslations("LanguageSelect");
  const activeLocale = useLocale() as Locale;
  const router = useRouter();
  const [selected, setSelected] = useState<Locale>(activeLocale);
  const [isPending, startTransition] = useTransition();

  const handleContinue = () => {
    startTransition(async () => {
      if (selected !== activeLocale) {
        await setLocale(selected);
        router.refresh();
      }
        onContinueAction();
    });
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-gov-950 via-gov-900 to-gov-800 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">{t("title")}</h1>
          <p className="mt-2 text-sm text-gov-300">{t("subtitle")}</p>
        </div>

        <div className="space-y-3">
          {locales.map((code) => {
            const isSelected = code === selected;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setSelected(code)}
                aria-pressed={isSelected}
                className={`w-full flex items-center justify-between gap-4 rounded-2xl border p-5 text-left transition ${
                  isSelected
                    ? "border-white bg-white shadow-xl"
                    : "border-white/20 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div>
                  <p
                    className={`text-lg font-semibold ${
                      isSelected ? "text-gov-900" : "text-white"
                    }`}
                  >
                    {localeLabels[code]}
                  </p>
                  <p
                    className={`text-sm ${
                      isSelected ? "text-gov-800" : "text-gov-300"
                    }`}
                  >
                    {localeWelcome[code]}
                  </p>
                  <p
                    className={`mt-1 text-xs ${
                      isSelected ? "text-gray-400" : "text-gov-400"
                    }`}
                  >
                    {localeEnglishLabels[code]}
                  </p>
                </div>

                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    isSelected
                      ? "border-gov-500 bg-gov-500 text-gov-950"
                      : "border-white/40 text-transparent"
                  }`}
                >
                  <Check size={16} strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          disabled={isPending}
          className="mt-8 w-full py-3.5 bg-white text-gov-800 font-semibold rounded-xl shadow-lg shadow-gov-950/40 hover:bg-gov-50 disabled:opacity-70 active:scale-[0.99] transition"
        >
          {t("continue")}
        </button>

        <div className="mt-8 flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
          <span className="w-6 h-1.5 rounded-full bg-white" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
        </div>
      </div>
    </div>
  );
}
