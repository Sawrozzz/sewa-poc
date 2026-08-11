"use client";
import type { EventBus, LocaleState, ThemePreference, ThemeState } from "@sewa/host-platform";
import { privileged } from "./host-privileges";

/**
 * Maps the shell's internal locale codes (en / sri / tam — next-intl
 * conventions) to the BCP47 LocaleState delivered to mini apps.
 */
export const SHELL_LOCALE_TO_BCP47: Record<string, LocaleState> = {
  en: { locale: "en-LK", language: "en", direction: "ltr" },
  sri: { locale: "si-LK", language: "si", direction: "ltr" },
  tam: { locale: "ta-LK", language: "ta", direction: "ltr" },
};

const LOCALE_COOKIE = "locale";
const THEME_STORAGE_KEY = "sewa-theme";
const DEFAULT_LOCALE_CODE = "en";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface AppearanceControllerDeps {
  eventBus: EventBus;
}

/**
 * The shell's single source of truth for host-driven locale & theme. Owns the
 * active locale and the theme preference + resolved mode, applies `dir`/`lang`/
 * `data-theme` to the DOM, and publishes `appearance.locale.changed` /
 * `appearance.theme.changed` so the RpcServer broadcasts them to subscribed
 * mini apps. Mini apps react to those notifications; the host holds no
 * mini-app content.
 */
export function createAppearanceController(deps: AppearanceControllerDeps) {
  const { eventBus } = deps;

  let localeCode = resolveInitialLocaleCode();
  let localeState: LocaleState =
    SHELL_LOCALE_TO_BCP47[localeCode] ?? SHELL_LOCALE_TO_BCP47[DEFAULT_LOCALE_CODE];

  let preference: ThemePreference = readThemePreference();
  let themeState: ThemeState = {
    preference,
    mode: resolveMode(preference),
  };

  function resolveInitialLocaleCode(): string {
    const cookie = readCookie(LOCALE_COOKIE);
    if (cookie && SHELL_LOCALE_TO_BCP47[cookie]) return cookie;
    return DEFAULT_LOCALE_CODE;
  }

  function readThemePreference(): ThemePreference {
    const storage = privileged.localStorage;
    if (!storage) return "system";
    const stored = storage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "system";
  }

  function prefersDark(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function resolveMode(themePref: ThemePreference): "light" | "dark" {
    if (themePref === "system") return prefersDark() ? "dark" : "light";
    return themePref;
  }

  function applyDom(): void {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("dir", localeState.direction);
    document.documentElement.setAttribute("lang", localeState.locale);
    document.documentElement.setAttribute("data-theme", themeState.mode);
  }

  return {
    getLocale(): LocaleState {
      return { ...localeState };
    },
    getTheme(): ThemeState {
      return { ...themeState };
    },
    /** Switches the active locale (cookie + DOM + event). */
    setLocale(code: string): void {
      if (!SHELL_LOCALE_TO_BCP47[code] || code === localeCode) return;
      localeCode = code;
      localeState = SHELL_LOCALE_TO_BCP47[code];
      if (typeof document !== "undefined") {
        // biome-ignore lint/suspicious/noDocumentCookie: <used to set Locale>
        document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
      applyDom();
      void eventBus.emit("appearance.locale.changed", "shell", this.getLocale());
    },
    setThemePreference(next: ThemePreference): void {
      preference = next;
      privileged.localStorage?.setItem(THEME_STORAGE_KEY, next);
      themeState = { preference, mode: resolveMode(preference) };
      applyDom();
      void eventBus.emit("appearance.theme.changed", "shell", this.getTheme());
    },
    toggleTheme(): void {
      this.setThemePreference(themeState.mode === "dark" ? "light" : "dark");
    },
    /** Writes initial `dir`/`lang`/`data-theme` to the DOM. Call once after mount. */
    apply(): void {
      applyDom();
    },
  };
}

export type AppearanceController = ReturnType<typeof createAppearanceController>;
