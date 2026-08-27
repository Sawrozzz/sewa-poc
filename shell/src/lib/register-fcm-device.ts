"use client";

import type { Platform } from "./PlatformDetector";
import { getApplicationPlatform } from "./PlatformDetector";

const APP_VERSION = "1.0.0";

export type FcmRegistrationFailure = {
  /** Coarse bucket the UI can branch on without parsing messages. */
  reason: "unavailable" | "network" | "http";
  /** HTTP status, when the request reached the route handler. */
  status?: number;
  /** Human-readable detail, safe to render. */
  message: string;
};

export type FcmRegistrationResult = { ok: true } | ({ ok: false } & FcmRegistrationFailure);

/** Pulls the most useful message out of a failed response without throwing on a non-JSON body. */
async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  if (!body) return `Device registration failed (HTTP ${response.status}).`;

  try {
    const parsed = JSON.parse(body);
    const message = parsed?.message ?? parsed?.error;
    if (typeof message === "string" && message.trim()) return message;
  } catch {
    // Not JSON — fall through to the raw body.
  }

  return body.slice(0, 200);
}

/**
 * Sends the FCM registration token to the backend so this device is a valid
 * push target. Without this call the token only exists in the browser and the
 * backend has nothing to send notifications to.
 *
 * Never throws: failures come back as `{ ok: false }` so the caller can decide
 * whether to surface them.
 */
export async function registerFcmDevice(token: string): Promise<FcmRegistrationResult> {
  if (typeof window === "undefined" || !token) {
    return {
      ok: false,
      reason: "unavailable",
      message: "No FCM token available to register.",
    };
  }

  const platform: Platform = getApplicationPlatform();

  const payload = {
    platform,
    token,
    appVersion: APP_VERSION,
  };

  let response: Response;
  try {
    response = await fetch("/api/fcm-register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("FCM: device registration request failed:", error);
    return {
      ok: false,
      reason: "network",
      message: `Could not reach the notification service (${message}).`,
    };
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    console.error("FCM: device registration failed", response.status, message);
    return { ok: false, reason: "http", status: response.status, message };
  }

  return { ok: true };
}
