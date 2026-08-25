"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { SRI_LANKA_DIAL_CODE } from "@/core/mocks/mock-user";
import { LocaleSwitcher } from "@/features/shell-chrome/LanguageSwitcher";
import { SriLankaFlag } from "./SriLankaFlag";

/** Groups a bare national number as "71 234 5678" while typing. */
function formatPhone(digits: string) {
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 9)];
  return parts.filter(Boolean).join(" ");
}

export function PhoneLoginScreen({
  initialPhone = "",
  onOtpSentAction,
}: {
  initialPhone?: string;
  onOtpSentAction: (result: { phoneNumber: string; otp: string }) => void;
}) {
  const t = useTranslations("LoginPage");
  const [digits, setDigits] = useState(initialPhone);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/phone-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: digits }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.message || "Could not send OTP");
        return;
      }

      onOtpSentAction({
        phoneNumber: digits,
        otp: data?.otp ?? "",
      });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-gov-950 via-gov-900 to-gov-800 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex justify-end">
          <LocaleSwitcher />
        </div>

        <div className="text-center mb-8 mt-4">
          <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
            <span className="text-4xl">🏛️</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{t("portal_title")}</h1>
          <p className="text-gov-300 text-sm">{t("subtitle")}</p>
        </div>

        <div className="bg-white rounded-xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">{t("heading")}</h2>
          <p className="text-sm text-gray-500 mb-6">{t("description")}</p>

          {!!error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="phone">
                {t("phone_label")}
              </label>

              <div className="flex items-stretch rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-gov-500 transition overflow-hidden">
                <span className="flex items-center gap-2 px-3 bg-gray-50 border-r border-gray-300 text-sm font-medium text-gray-700 select-none">
                  <SriLankaFlag />
                  {SRI_LANKA_DIAL_CODE}
                </span>
                {/** biome-ignore lint/correctness/useUniqueElementIds: <used for phoneNumber> */}
                <input
                  autoComplete="tel-national"
                  className="flex-1 px-4 py-2.5 outline-none tracking-wide"
                  id="phone"
                  inputMode="numeric"
                  onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder={t("phone_placeholder")}
                  required
                  type="tel"
                  value={formatPhone(digits)}
                />
              </div>

              <p className="mt-2 text-xs text-gray-400">{t("hint")}</p>
            </div>

            <button
              className="w-full py-2.5 bg-gov-500 hover:bg-gov-600 disabled:text-gov-700 font-semibold rounded-lg transition flex items-center justify-center gap-2"
              disabled={loading || digits.length < 9}
              type="submit"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-gov-950/30 border-t-gov-950 rounded-full animate-spin" />
                  {t("sending_otp")}
                </>
              ) : (
                t("send_otp")
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-6 text-gov-400 text-xs">
          <p>Government of Sri Lanka | Digital Transformation Initiative</p>
        </div>
      </div>
    </div>
  );
}
