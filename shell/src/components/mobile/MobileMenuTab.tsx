"use client";

import type { ThemePreference } from "@sewa/host-platform";
import {
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  RefreshCcwIcon,
  SunIcon,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState } from "react";
import { localeLabels, locales } from "@/i18n/config";
import { authClient, mapSessionUser } from "@/lib/auth-client";
import { useAppRefresh } from "@/lib/use-app-refresh";
import { useLocaleSwitch } from "@/lib/use-locale-switch";
import { useTheme } from "@/lib/use-theme";

const THEME_OPTIONS: { value: ThemePreference; Icon: typeof SunIcon; labelKey: string }[] = [
  { value: "light", Icon: SunIcon, labelKey: "theme_light" },
  { value: "dark", Icon: MoonIcon, labelKey: "theme_dark" },
  { value: "system", Icon: MonitorIcon, labelKey: "theme_system" },
];

function Section({
  children,
  isDark,
  title,
}: {
  children: ReactNode;
  isDark: boolean;
  title: string;
}) {
  return (
    <section>
      <h2
        className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${
          isDark ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {title}
      </h2>

      <div
        className={`overflow-hidden rounded-2xl border ${
          isDark ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

/** Which settings dropdown is expanded — at most one, accordion-style. */
type OpenDropdown = "language" | "theme" | null;

/**
 * A settings row that collapses its options behind the value currently in
 * effect. Written as a disclosure rather than a native `<select>` so each option
 * can carry its own icon and so the open list is styled and sized like the rest
 * of the menu instead of a platform picker.
 */
function DropdownRow({
  children,
  icon,
  isDark,
  isOpen,
  label,
  onToggle,
  value,
}: {
  children: ReactNode;
  icon: ReactNode;
  isDark: boolean;
  isOpen: boolean;
  label: string;
  onToggle: () => void;
  value: string;
}) {
  return (
    <li>
      <button
        aria-expanded={isOpen}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors ${
          isDark ? "active:bg-gray-800" : "active:bg-gov-50"
        }`}
        onClick={onToggle}
        type="button"
      >
        {icon}

        <span className={`flex-1 font-medium ${isDark ? "text-gray-100" : "text-gray-900"}`}>
          {label}
        </span>

        <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>{value}</span>

        <ChevronDownIcon
          className={`transition-transform ${isOpen ? "rotate-180" : ""} ${
            isDark ? "text-gray-500" : "text-gray-400"
          }`}
          size={17}
        />
      </button>

      {!!isOpen && (
        <div
          className={`border-t ${isDark ? "border-gray-800 bg-gray-950/40" : "border-gray-100 bg-gray-50/60"}`}
        >
          {children}
        </div>
      )}
    </li>
  );
}

/**
 * The Menu tab — the phone home for everything the desktop header crams into
 * its top-right corner: language, theme, the cache reset and sign out, plus the
 * signed-in citizen's details.
 */
export function MobileMenuTab() {
  const t = useTranslations("MobileMenu");
  const router = useRouter();

  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);

  const { isDark, preference, setPreference } = useTheme();
  const { locale, changeLocale, isPending: localePending } = useLocaleSwitch();
  const { isRefreshing, showSuccess, refresh } = useAppRefresh();

  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);

  const handleLogout = async () => {
    await authClient.signOut();
    router.replace("/");
  };

  const toggleDropdown = (which: Exclude<OpenDropdown, null>) =>
    setOpenDropdown((current) => (current === which ? null : which));

  // The collapsed row shows the stored *preference*, not the resolved mode —
  // "System" has to stay readable as System rather than silently becoming
  // "Dark" after sunset.
  const activeThemeOption = THEME_OPTIONS.find((o) => o.value === preference) ?? THEME_OPTIONS[2];
  const ActiveThemeIcon = activeThemeOption.Icon;

  const rowClass = `flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors disabled:opacity-60 ${
    isDark ? "active:bg-gray-800" : "active:bg-gov-50"
  }`;
  const dividerClass = isDark ? "divide-gray-800" : "divide-gray-100";
  const labelClass = isDark ? "text-gray-100" : "text-gray-900";
  const mutedClass = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <div className="space-y-6 px-4 py-4">
      {/* Profile */}
      {!!user && (
        <section
          className={`rounded-2xl border p-4 ${
            isDark ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-lg font-bold ${
                isDark
                  ? "border-gray-700 bg-gray-800 text-gray-200"
                  : "border-gov-100 bg-gov-50 text-gov-800"
              }`}
            >
              {session?.user?.image ? (
                <Image
                  alt={user.fullName}
                  className="h-full w-full object-cover"
                  height={56}
                  src={session.user.image}
                  unoptimized
                  width={56}
                />
              ) : (
                user.fullName.charAt(0).toUpperCase()
              )}
            </div>

            <div className="min-w-0">
              <p className={`truncate text-base font-bold ${labelClass}`}>{user.fullName}</p>
              <p className={`truncate text-xs ${mutedClass}`}>{user.phoneNumber}</p>
              <p className={`truncate text-xs ${mutedClass}`}>{user.email}</p>
            </div>
          </div>

          <dl
            className={`mt-4 grid grid-cols-2 gap-3 border-t pt-3 ${
              isDark ? "border-gray-800" : "border-gray-100"
            }`}
          >
            <div>
              <dt className={`text-[11px] uppercase tracking-wide ${mutedClass}`}>{t("nic")}</dt>
              <dd className={`truncate text-sm font-medium ${labelClass}`}>{user.nationalId}</dd>
            </div>

            <div>
              <dt className={`text-[11px] uppercase tracking-wide ${mutedClass}`}>{t("roles")}</dt>
              <dd className={`truncate text-sm font-medium ${labelClass}`}>
                {user.roles.join(", ") || "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Preferences — both collapsed to the value in effect */}
      <Section isDark={isDark} title={t("preferences")}>
        <ul className={`divide-y ${dividerClass}`}>
          <DropdownRow
            icon={<GlobeIcon className={mutedClass} size={18} />}
            isDark={isDark}
            isOpen={openDropdown === "language"}
            label={t("language")}
            onToggle={() => toggleDropdown("language")}
            value={localeLabels[locale]}
          >
            <ul className={`divide-y ${dividerClass}`}>
              {locales.map((code) => {
                const isActive = code === locale;

                return (
                  <li key={code}>
                    <button
                      className={`${rowClass} pl-12`}
                      disabled={localePending}
                      onClick={() => {
                        changeLocale(code);
                        setOpenDropdown(null);
                      }}
                      type="button"
                    >
                      <span className={`flex-1 ${isActive ? "font-semibold" : ""} ${labelClass}`}>
                        {localeLabels[code]}
                      </span>

                      {!!isActive && <CheckIcon className="text-gov-600" size={18} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </DropdownRow>

          <DropdownRow
            icon={<ActiveThemeIcon className={mutedClass} size={18} />}
            isDark={isDark}
            isOpen={openDropdown === "theme"}
            label={t("theme")}
            onToggle={() => toggleDropdown("theme")}
            value={t(activeThemeOption.labelKey)}
          >
            <ul className={`divide-y ${dividerClass}`}>
              {THEME_OPTIONS.map(({ value, Icon, labelKey }) => {
                const isActive = preference === value;

                return (
                  <li key={value}>
                    <button
                      className={`${rowClass} pl-12`}
                      onClick={() => {
                        setPreference(value);
                        setOpenDropdown(null);
                      }}
                      type="button"
                    >
                      <Icon className={isActive ? "text-gov-600" : mutedClass} size={17} />

                      <span className={`flex-1 ${isActive ? "font-semibold" : ""} ${labelClass}`}>
                        {t(labelKey)}
                      </span>

                      {!!isActive && <CheckIcon className="text-gov-600" size={18} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </DropdownRow>
        </ul>
      </Section>

      {/* Actions */}
      <Section isDark={isDark} title={t("app")}>
        <ul className={`divide-y ${dividerClass}`}>
          <li>
            <button className={rowClass} disabled={isRefreshing} onClick={refresh} type="button">
              <RefreshCcwIcon
                className={`${mutedClass} ${isRefreshing ? "animate-spin" : ""}`}
                size={18}
              />

              <span className="flex-1">
                <span className={`block ${labelClass}`}>{t("refresh")}</span>
                <span className={`block text-xs ${mutedClass}`}>{t("refresh_hint")}</span>
              </span>

              {!!showSuccess && <span className="text-xs text-emerald-600">✓</span>}
            </button>
          </li>

          <li>
            <button
              className={`${rowClass} ${isDark ? "text-red-400" : "text-red-600"}`}
              onClick={handleLogout}
              type="button"
            >
              <LogOutIcon size={18} />
              <span className="flex-1 font-medium">{t("sign_out")}</span>
            </button>
          </li>
        </ul>
      </Section>

      <p className={`pb-2 text-center text-xs ${mutedClass}`}>
        {t("version", { version: "1.0.0" })}
      </p>
    </div>
  );
}
