"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { MOCK_OTP, SRI_LANKA_DIAL_CODE } from "@/lib/mock-user";

const OTP_LENGTH = 6;

function toDigits(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, OTP_LENGTH)
    .padEnd(OTP_LENGTH, " ")
    .split("")
    .map((c) => (c === " " ? "" : c));
}

export function OtpScreen({
  phoneNumber,
  prefilledOtp,
  onBackAction,
  onVerifiedAction,
}: {
  phoneNumber: string;
  /** OTP echoed back by the mock send endpoint. */
  prefilledOtp?: string;
  onBackAction: () => void;
  onVerifiedAction: () => void;
}) {
  const t = useTranslations("OtpPage");
  const [code, setCode] = useState<string[]>(() => toDigits(prefilledOtp || MOCK_OTP));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const setDigitAt = (index: number, digit: string) => {
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
  };

  const handleChange = (index: number, value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      setDigitAt(index, "");
      return;
    }

    // Handles both single keystrokes and pasted codes.
    setCode((prev) => {
      const next = [...prev];
      for (let i = 0; i < digits.length && index + i < OTP_LENGTH; i++) {
        next[index + i] = digits[i];
      }
      return next;
    });

    const nextIndex = Math.min(index + digits.length, OTP_LENGTH - 1);
    inputs.current[nextIndex]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      e.preventDefault();
      setDigitAt(index - 1, "");
      inputs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // No OTP validation in the POC — the backend accepts any code.
      const res = await fetch("/api/auth/phone-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, code: code.join("") }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || "Verification failed");
        return;
      }

      onVerifiedAction();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const displayPhone = `${SRI_LANKA_DIAL_CODE} ${phoneNumber}`;

  return (
    <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-gov-950 via-gov-900 to-gov-800 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <button
          className="mb-4 inline-flex items-center gap-2 text-sm text-gov-300 hover:text-white transition"
          onClick={onBackAction}
          type="button"
        >
          <ArrowLeft size={16} />
          {t("change_number")}
        </button>

        <div className="bg-white rounded-xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">{t("heading")}</h2>
          <p className="text-sm text-gray-500 mb-6">{t("description", { phone: displayPhone })}</p>

          {!!error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="flex justify-between gap-2">
              {code.map((digit, index) => (
                <input
                  aria-label={`Digit ${index + 1}`}
                  autoComplete="one-time-code"
                  className="w-12 h-14 text-center text-xl font-semibold text-gray-800 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gov-500 transition"
                  inputMode="numeric"
                  key={digit}
                  maxLength={OTP_LENGTH}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  ref={(el) => {
                    inputs.current[index] = el;
                  }}
                  type="text"
                  value={digit}
                />
              ))}
            </div>

            <button
              className="w-full py-2.5 bg-gov-500 hover:bg-gov-600 text-gov-950 font-semibold rounded-lg transition flex items-center justify-center gap-2"
              disabled={loading}
              type="submit"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-gov-950/30 border-t-gov-950 rounded-full animate-spin" />
                  {t("confirming")}
                </>
              ) : (
                t("confirm")
              )}
            </button>
          </form>

          <button
            className="mt-4 w-full text-center text-sm text-gov-800 hover:text-gov-900 transition"
            onClick={() => setCode(toDigits(prefilledOtp || MOCK_OTP))}
            type="button"
          >
            {t("resend")}
          </button>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
          <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
          <span className="w-6 h-1.5 rounded-full bg-white" />
        </div>
      </div>
    </div>
  );
}
