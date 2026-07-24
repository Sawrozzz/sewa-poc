export const locales = ["en", "sri", "tam"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  sri: "සිංහල",
  tam: "தமிழ்",
};

export function isValidLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
