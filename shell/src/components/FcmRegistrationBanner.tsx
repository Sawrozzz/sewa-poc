"use client";

import { useFcmToken } from "@/lib/useFcmToken";

/**
 * Silent initializer for FCM. Keeps the single `useFcmToken()` call so the
 * device still registers, but renders nothing. Errors are console-only
 * (see `useFcmToken`/`register-fcm-device`) instead of a UI banner.
 */
export default function FcmRegistrationBanner() {
  useFcmToken();
  return null;
}
