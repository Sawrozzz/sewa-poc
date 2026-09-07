"use client";

import { PhoneIcon, UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function LoginTypeScreen({
  onPhoneLoginAction,
  onGuestAction,
}: {
  onPhoneLoginAction: () => void;
  onGuestAction: () => void;
}) {
  const t = useTranslations("LoginPage");

  return (
    <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-gov-950 via-gov-900 to-gov-800 p-4">
      <div className="w-full max-w-md animate-fade-in">

        <div className="text-center mb-8 mt-4">
          <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
            <span className="text-4xl">🏛️</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{t("portal_title")}</h1>
          <p className="text-gov-300 text-sm">{t("login_type_subtitle")}</p>
        </div>

        <div className="space-y-3">
          <button
            className={`w-full flex items-center gap-4 rounded-2xl border p-4 text-left transition ${"border-white/20 bg-white/5 hover:bg-white/10"}`}
            onClick={onPhoneLoginAction}
            type="button"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gov-500/20 text-gov-300">
              <PhoneIcon size={20} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">
                {t("login_with_phone")}
              </span>
              <span className="block text-xs text-gov-300">{t("login_with_phone_hint")}</span>
            </span>
          </button>

          <button
            className="w-full flex items-center gap-4 rounded-2xl border border-white/20 bg-white/5 p-4 text-left transition hover:bg-white/10"
            onClick={onGuestAction}
            type="button"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-gov-300">
              <UserIcon size={20} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">{t("login_as_guest")}</span>
              <span className="block text-xs text-gov-300">{t("login_as_guest_hint")}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
