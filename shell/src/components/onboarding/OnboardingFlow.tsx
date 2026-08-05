"use client";

import { useEffect, useState } from "react";

import { LanguageScreen } from "./LanguageScreen";
import { OtpScreen } from "./OtpScreen";
import { PhoneLoginScreen } from "./PhoneLoginScreen";
import { WelcomeScreen } from "./WelcomeScreen";

import { privileged } from "@/platform/host-privileges";

type Step = "welcome" | "language" | "login" | "otp";

/** Set once the intro is done, so returning users land straight on login. */
const ONBOARDED_KEY = "sewa.onboarding.completed";

export function OnboardingFlow({
  onAuthenticatedAction,
}: {
  onAuthenticatedAction: () => void;
}) {
  // null until the client has read localStorage — avoids flashing the welcome
  // screen to users who already went through the intro.
  const [step, setStep] = useState<Step | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");

  useEffect(() => {
    const onboarded =
      typeof window !== "undefined" &&
      privileged.localStorage?.getItem(ONBOARDED_KEY) === "true";
    setStep(onboarded ? "login" : "welcome");
  }, []);

  const completeIntro = () => {
    try {
      privileged.localStorage?.setItem(ONBOARDED_KEY, "true");
    } catch {
      // Private mode / storage disabled — the intro simply shows again.
    }
    setStep("login");
  };

  if (step === null) {
    return (
      <div className="flex items-center justify-center h-dvh bg-gov-950">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (step === "welcome") {
    return <WelcomeScreen onContinueAction={() => setStep('language')} />;
  }

  if (step === "language") {
    return <LanguageScreen onContinueAction={completeIntro} />;
  }

  if (step === "otp") {
    return (
      <OtpScreen
        phoneNumber={phoneNumber}
        prefilledOtp={otp}
        onBackAction={() => setStep("login")}
        onVerifiedAction={onAuthenticatedAction}
      />
    );
  }

  return (
    <PhoneLoginScreen
      initialPhone={phoneNumber}
      onOtpSentAction={({ phoneNumber: phone, otp: sentOtp }) => {
        setPhoneNumber(phone);
        setOtp(sentOtp);
        setStep("otp");
      }}
    />
  );
}
