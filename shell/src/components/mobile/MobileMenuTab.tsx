"use client";

import type { ThemePreference } from "@lizuz/mini-app-types";
import {
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  LockIcon,
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
import { useEffect, useState } from "react";
import { AppLockSetupScreen } from "@/components/applock/AppLockSetupScreen";
import { AppLockUnlockScreen } from "@/components/applock/AppLockUnlockScreen";
import {
  disableAppLock,
  isAppLockEnabled,
  markAppUnlockedThisSession,
  setAppLockPin,
} from "@/features/auth/app-lock";
import { authClient, mapSessionUser } from "@/features/auth/auth-client";
import { useAppRefresh } from "@/hooks/use-app-refresh";
import { useLocaleSwitch } from "@/hooks/use-locale-switch";
import { useTheme } from "@/hooks/use-theme";
import { localeLabels, locales } from "@/i18n/config";
import { isInstalledPwa } from "@/platform/services/biometric";

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
  const tAppLock = useTranslations("AppLock");
  const router = useRouter();

  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);

  // Read after mount only — both reach real browser state that isn't available
  // during SSR, so starting from `false` here keeps hydration in sync.
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [isPwa, setIsPwa] = useState(false);
  const [lockOverlay, setLockOverlay] = useState<"setup" | "disable" | null>(null);

  useEffect(() => {
    setAppLockEnabledState(isAppLockEnabled());
    setIsPwa(isInstalledPwa());
  }, []);

  const { isDark, preference, setPreference } = useTheme();
  const { locale, changeLocale, isPending: localePending } = useLocaleSwitch();
  const { isRefreshing, showSuccess, refresh } = useAppRefresh();

  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);

  const handleLogout = async () => {
    await authClient.signOut();
    router.replace("/");
  };

  const handleForgotPinFromMenu = async () => {
    disableAppLock();
    setAppLockEnabledState(false);
    setLockOverlay(null);
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

      {/* Security — only meaningful once the app has its own window to guard */}
      {!!isPwa && (
        <Section isDark={isDark} title={t("security")}>
          <ul className={`divide-y ${dividerClass}`}>
            <li className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm">
              <LockIcon className={mutedClass} size={18} />

              <span className="flex-1">
                <span className={`block font-medium ${labelClass}`}>{t("app_lock")}</span>
                <span className={`block text-xs ${mutedClass}`}>{t("app_lock_hint")}</span>
              </span>

              <button
                aria-checked={appLockEnabled}
                aria-label={t("app_lock")}
                className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  appLockEnabled ? "bg-gov-500" : isDark ? "bg-gray-700" : "bg-gray-300"
                }`}
                onClick={() => setLockOverlay(appLockEnabled ? "disable" : "setup")}
                role="switch"
                type="button"
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    appLockEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </li>
          </ul>
        </Section>
      )}

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

      {lockOverlay === "setup" && (
        <div className="fixed inset-0 z-100">
          <AppLockSetupScreen
            onBackAction={() => setLockOverlay(null)}
            onCreatedAction={async (pin) => {
              await setAppLockPin(pin);
              markAppUnlockedThisSession();
              setAppLockEnabledState(true);
              setLockOverlay(null);
            }}
          />
        </div>
      )}

      {lockOverlay === "disable" && (
        <div className="fixed inset-0 z-100">
          <AppLockUnlockScreen
            description={tAppLock("disable_description")}
            heading={tAppLock("disable_heading")}
            onCancelAction={() => setLockOverlay(null)}
            onForgotAction={handleForgotPinFromMenu}
            onUnlockedAction={() => {
              disableAppLock();
              setAppLockEnabledState(false);
              setLockOverlay(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
