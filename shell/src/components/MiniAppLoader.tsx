"use client";

import { useEffect, useState } from "react";

const DEFAULT_MESSAGES = [
  "Getting things ready…",
  "Just a sec…",
  "Warming things up…",
  "Almost there…",
  "Any moment now…",
  "Fetching...",
  "All set ....",
];

interface MiniAppLoaderProps {
  name: string;
  icon?: string;
  color?: string;
  messages?: string[];
  /** How long each message stays on screen. */
  messageIntervalMs?: number;
}

export function MiniAppLoader({
  name,
  icon,
  color = "#dc9a0d",
  messages = DEFAULT_MESSAGES,
  messageIntervalMs = 2200,
}: MiniAppLoaderProps) {
  const [step, setStep] = useState(0);

  // Advance one message at a time and settle on the last one — cycling back to
  // "getting ready" on a slow load would read as though it had restarted.
  useEffect(() => {
    if (step >= messages.length - 1) return;
    const timer = setTimeout(() => setStep(step + 1), messageIntervalMs);
    return () => clearTimeout(timer);
  }, [step, messages.length, messageIntervalMs]);

  return (
    <div className="flex h-screen items-center justify-center bg-linear-to-b from-white to-slate-50">
      <div className="flex flex-col items-center px-6">
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
          <span
            className="miniapp-halo absolute inset-0 rounded-3xl"
            style={{ backgroundColor: `${color}33` }}
          />
          <span
            className="miniapp-halo absolute inset-0 rounded-3xl"
            style={{ backgroundColor: `${color}33`, animationDelay: "1.1s" }}
          />
          <div
            className="miniapp-breathe relative flex h-20 w-20 items-center justify-center rounded-3xl text-4xl shadow-sm"
            style={{
              backgroundColor: `${color}18`,
              border: `1px solid ${color}30`,
            }}
          >
            {icon || "📦"}
          </div>
        </div>

        <p className="text-base font-semibold text-gray-900">{name}</p>

        <div aria-live="polite" className="mt-1 flex h-5 items-center">
          <p className="miniapp-message text-xs text-gray-400" key={step}>
            {messages[step]}
          </p>
        </div>

        <div className="relative mt-5 h-1 w-40 overflow-hidden rounded-full bg-gray-200/70">
          <div
            className="miniapp-slide absolute inset-y-0 w-1/3 rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}
