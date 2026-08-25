"use client";

import { isInstalledPwa } from "@/platform/services/biometric";

const APP_VERSION = "1.0.0";

type FcmPlatform = "WEB" | "ANDROID";

function findPlatform(): FcmPlatform {
  return isInstalledPwa() ? "ANDROID" : "WEB";
}

/**
 * Sends the FCM registration token to the backend so this device is a valid
 * push target. Without this call the token only exists in the browser and the
 * backend has nothing to send notifications to.
 */
export async function registerFcmDevice(token: string): Promise<void> {
  if (typeof window === "undefined" || !token) return;

  const platform = findPlatform();

  const payload = {
    platform,
    token,
    appVersion: APP_VERSION,
  };

  console.log("FCM: registering device with token:", token, payload);

  try {
    const response = await fetch("/api/fcm-register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        "FCM: device registration failed",
        response.status,
        await response.text(),
      );
      return;
    }

    console.log(
      "FCM: device registered with backend.",
      await response.json(),
    );
  } catch (error) {
    console.error("FCM: device registration request failed:", error);
  }
}