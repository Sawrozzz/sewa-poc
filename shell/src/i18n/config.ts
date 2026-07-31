export const locales = ["en", "sri", "tam"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  sri: "සිංහල",
  tam: "தமிழ்",
};

/** English name of each locale, shown alongside the native label. */
export const localeEnglishLabels: Record<Locale, string> = {
  en: "English",
  sri: "Sinhala",
  tam: "Tamil",
};

/** "Welcome" written in each language — used on the language picker cards. */
export const localeWelcome: Record<Locale, string> = {
  en: "Welcome",
  sri: "ආයුබෝවන්",
  tam: "வணக்கம்",
};

export function isValidLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
