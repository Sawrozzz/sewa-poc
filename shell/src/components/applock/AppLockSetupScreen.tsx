"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PinDigits } from "./PinDigits";

type Stage = "create" | "confirm";

const emptyDigits = () => Array(4).fill("");

/**
 * Two-step PIN creation: enter a new 4-digit PIN, then repeat it to confirm.
 * Mirrors `OtpScreen`'s card layout so App Lock reads as part of the same
 * verification family in the UI.
 */
export function AppLockSetupScreen({
  onBackAction,
  onCreatedAction,
}: {
  onBackAction?: () => void;
  onCreatedAction: (pin: string) => void;
}) {
  const t = useTranslations("AppLock");
  const [stage, setStage] = useState<Stage>("create");
  const [firstPin, setFirstPin] = useState("");
  const [digits, setDigits] = useState<string[]>(emptyDigits());
  const [error, setError] = useState("");

  const handleCreateComplete = (pin: string) => {
    setFirstPin(pin);
    setDigits(emptyDigits());
    setError("");
    setStage("confirm");
  };

  const handleConfirmComplete = (pin: string) => {
    if (pin !== firstPin) {
      setError(t("mismatch"));
      setDigits(emptyDigits());
      return;
    }
    onCreatedAction(pin);
  };

  const handleStartOver = () => {
    setStage("create");
    setFirstPin("");
    setDigits(emptyDigits());
    setError("");
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-linear-to-br from-gov-950 via-gov-900 to-gov-800 p-4">
      <div className="w-full max-w-md animate-fade-in">
        {!!onBackAction && (
          <button
            className="mb-4 inline-flex items-center gap-2 text-sm text-gov-300 hover:text-white transition"
            onClick={stage === "confirm" ? handleStartOver : onBackAction}
            type="button"
          >
            <ArrowLeft size={16} />
            {t("back")}
          </button>
        )}

        <div className="bg-white rounded-xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            {stage === "create" ? t("create_heading") : t("confirm_heading")}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {stage === "create" ? t("create_description") : t("confirm_description")}
          </p>

          {!!error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <PinDigits
            digits={digits}
            key={stage}
            onChangeAction={setDigits}
            onCompleteAction={stage === "create" ? handleCreateComplete : handleConfirmComplete}
          />
        </div>
      </div>
    </div>
  );
}
