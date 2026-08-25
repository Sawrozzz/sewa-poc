"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useCallback, useTransition } from "react";
import { usePlatform } from "@/context";
import { setLocale as persistLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";

/**
 * The one way to change language in the shell.
 *
 * Both halves are required and neither is optional: the appearance controller
 * writes the cookie, flips `dir`/`lang` on the DOM and notifies mini apps
 * immediately, while the server action + `router.refresh()` re-render next-intl
 * on the server so the shell's own copy follows. Any surface offering a language
 * choice — the desktop select, the mobile menu — calls this so the two can never
 * drift apart.
 */
export function useLocaleSwitch() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { appearance } = usePlatform();

  const changeLocale = useCallback(
    (nextLocale: string) => {
      if (nextLocale === locale) return;

      appearance.setLocale(nextLocale);

      startTransition(async () => {
        await persistLocale(nextLocale);
        router.refresh();
      });
    },
    [locale, appearance, router],
  );

  return { locale, changeLocale, isPending };
}
