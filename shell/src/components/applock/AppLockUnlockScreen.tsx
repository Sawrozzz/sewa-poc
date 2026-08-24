"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { verifyAppLockPin } from "@/lib/app-lock";
import { PinDigits } from "./PinDigits";

const emptyDigits = () => Array(4).fill("");

/**
 * The gate shown every time the app opens (once App Lock is on): enter the
 * 4-digit PIN to reach the app. A forgotten PIN can only be recovered by
 * signing out — there is no separate recovery flow for a device-local lock.
 */
export function AppLockUnlockScreen({
  description,
  heading,
  onCancelAction,
  onForgotAction,
  onUnlockedAction,
}: {
  /** Overrides the default "app just opened" copy — e.g. for a disable-lock confirmation. */
  description?: string;
  heading?: string;
  /** Only set when this screen is reachable without it (e.g. opened from Menu settings). */
  onCancelAction?: () => void;
  onForgotAction: () => void;
  onUnlockedAction: () => void;
}) {
  const t = useTranslations("AppLock");
  const [digits, setDigits] = useState<string[]>(emptyDigits());
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleComplete = async (pin: string) => {
    setChecking(true);
    setError("");

    const ok = await verifyAppLockPin(pin);
    setChecking(false);

    if (!ok) {
      setError(t("incorrect"));
      setDigits(emptyDigits());
      return;
    }

    onUnlockedAction();
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-gov-950 via-gov-900 to-gov-800 p-4">
      <div className="w-full max-w-md animate-fade-in">
        {!!onCancelAction && (
          <button
            className="mb-4 inline-flex items-center gap-2 text-sm text-gov-300 hover:text-white transition"
            onClick={onCancelAction}
            type="button"
          >
            <ArrowLeft size={16} />
            {t("cancel")}
          </button>
        )}

        <div className="bg-white rounded-xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            {heading ?? t("unlock_heading")}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{description ?? t("unlock_description")}</p>

          {!!error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <PinDigits digits={digits} onChangeAction={setDigits} onCompleteAction={handleComplete} />

          {!!checking && <p className="mt-4 text-center text-sm text-gray-400">{t("checking")}</p>}
        </div>

        <button
          className="mt-6 w-full text-center text-sm text-gov-300 hover:text-white transition"
          onClick={onForgotAction}
          type="button"
        >
          {t("forgot")}
        </button>
      </div>
    </div>
  );
}
