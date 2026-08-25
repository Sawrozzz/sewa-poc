"use client";

import { useEffect, useRef } from "react";
import { APP_LOCK_PIN_LENGTH } from "@/features/auth/app-lock";

/** Stable, non-index keys for the fixed-size digit row. */
const SLOTS = Array.from({ length: APP_LOCK_PIN_LENGTH }, (_, i) => `pin-slot-${i}`);

/**
 * A row of `APP_LOCK_PIN_LENGTH` boxes for entering a numeric PIN, styled like
 * `OtpScreen`'s digit boxes but masked (dots, not digits) since a PIN is a
 * secret rather than a one-time code shown elsewhere.
 */
export function PinDigits({
  autoFocus = true,
  digits,
  onChangeAction,
  onCompleteAction,
}: {
  autoFocus?: boolean;
  digits: string[];
  onChangeAction: (next: string[]) => void;
  /** Fires once with the full PIN as soon as the last box is filled. */
  onCompleteAction: (pin: string) => void;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: initial-focus effect, must run once on mount only.
  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
  }, []);

  const setDigitAt = (index: number, digit: string) => {
    const next = [...digits];
    next[index] = digit;
    onChangeAction(next);
  };

  const handleChange = (index: number, value: string) => {
    const typed = value.replace(/\D/g, "");
    if (!typed) {
      setDigitAt(index, "");
      return;
    }

    const next = [...digits];
    for (let i = 0; i < typed.length && index + i < APP_LOCK_PIN_LENGTH; i++) {
      next[index + i] = typed[i];
    }
    onChangeAction(next);

    const nextIndex = Math.min(index + typed.length, APP_LOCK_PIN_LENGTH - 1);
    if (next.every((d) => d !== "")) {
      onCompleteAction(next.join(""));
    } else {
      inputs.current[nextIndex]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      setDigitAt(index - 1, "");
      inputs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < APP_LOCK_PIN_LENGTH - 1)
      inputs.current[index + 1]?.focus();
  };

  return (
    <div className="flex justify-center gap-3">
      {SLOTS.map((slot, index) => (
        <input
          aria-label={`PIN digit ${index + 1}`}
          autoComplete="off"
          className="w-14 h-16 text-center text-2xl font-semibold text-gray-800 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-gov-500 transition"
          inputMode="numeric"
          key={slot}
          maxLength={APP_LOCK_PIN_LENGTH}
          onChange={(e) => handleChange(index, e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => handleKeyDown(index, e)}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          type="password"
          value={digits[index] ?? ""}
        />
      ))}
    </div>
  );
}
