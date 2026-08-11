"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePlatform } from "@/context";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";
import { localeLabels, locales } from "@/i18n/config";

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { appearance } = usePlatform();

  const onChange = (nextLocale: string) => {
    if (nextLocale === locale) return;

    // Host-driven switch: the controller writes the cookie, publishes
    // appearance.locale.changed + a fresh shell.* catalog, and applies
    // direction/lang to the DOM immediately; the server action + refresh keep
    // next-intl SSR in sync.
    appearance.setLocale(nextLocale);

    startTransition(async () => {
      await setLocale(nextLocale);
      router.refresh();
    });
  };

  return (
    <div className="relative inline-flex items-center">
      <Globe className="pointer-events-none absolute left-3 text-gov-700" size={18} />

      <select
        aria-label={t("label")}
        className="
          appearance-none
          rounded-full
          border
          bg-white
          shadow-sm
          outline-none
          transition-all
          duration-200

          pl-10
          pr-8
          py-1

          text-sm
          font-medium
          text-gray-700

          hover:border-gov-400
          hover:bg-gov-50
          focus:border-gov-500
          focus:ring-2
          focus:ring-gov-200

          disabled:cursor-not-allowed
          disabled:opacity-60

          w-12
          sm:w-auto
          sm:min-w-37.5
        "
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        value={locale}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeLabels[code]}
          </option>
        ))}
      </select>

      <svg
        className="pointer-events-none absolute right-3 h-4 w-4 text-gray-500"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
