"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  disableAppLock,
  hasAppLockPrompted,
  isAppLockEnabled,
  isAppUnlockedThisSession,
  markAppLockPrompted,
  markAppUnlockedThisSession,
  setAppLockPin,
} from "@/features/auth/app-lock";
import { authClient } from "@/features/auth/auth-client";
import { isInstalledPwa } from "@/platform/services/biometric";
import { AppLockPromptScreen } from "./AppLockPromptScreen";
import { AppLockSetupScreen } from "./AppLockSetupScreen";
import { AppLockUnlockScreen } from "./AppLockUnlockScreen";

type Phase = "prompt" | "setup" | "locked" | "unlocked";

/**
 * Sits between a live session and the app itself. First time ever *running as
 * an installed PWA*: asks whether to turn App Lock on. Every app open after
 * that (a fresh PWA launch gets a fresh `sessionStorage`, see `lib/app-lock`):
 * if it's on, requires the PIN before rendering `children`.
 *
 * A browser tab never prompts or locks — the feature only makes sense once
 * the app has its own icon/window to protect, and `isInstalledPwa()` is how
 * the rest of the host tells the two apart.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  // null until the client has read storage — avoids flashing the app behind the lock.
  const [phase, setPhase] = useState<Phase | null>(null);

  useEffect(() => {
    if (!isInstalledPwa()) {
      setPhase("unlocked");
      return;
    }
    if (!hasAppLockPrompted()) {
      setPhase("prompt");
      return;
    }
    setPhase(isAppLockEnabled() && !isAppUnlockedThisSession() ? "locked" : "unlocked");
  }, []);

  const finishOnboardingStep = () => {
    markAppLockPrompted();
    markAppUnlockedThisSession();
    setPhase("unlocked");
  };

  const handleForgotPin = async () => {
    disableAppLock();
    await authClient.signOut();
    router.replace("/");
  };

  if (phase === null) {
    return (
      <div className="flex items-center justify-center h-dvh bg-gov-950">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "prompt") {
    return (
      <AppLockPromptScreen
        onEnableAction={() => setPhase("setup")}
        onSkipAction={finishOnboardingStep}
      />
    );
  }

  if (phase === "setup") {
    return (
      <AppLockSetupScreen
        onCreatedAction={async (pin) => {
          await setAppLockPin(pin);
          finishOnboardingStep();
        }}
      />
    );
  }

  if (phase === "locked") {
    return (
      <AppLockUnlockScreen
        onForgotAction={handleForgotPin}
        onUnlockedAction={() => {
          markAppUnlockedThisSession();
          setPhase("unlocked");
        }}
      />
    );
  }

  return <>{children}</>;
}
