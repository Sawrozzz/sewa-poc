"use client";

import type { Messaging } from "firebase/messaging";
import { getToken, onRegistered, onUnregistered, register } from "firebase/messaging";
import { useCallback, useEffect, useState } from "react";
import { getFirebaseMessaging } from "./firebase";

const VAPID_KEY =
  "BP3sLmCB0CMSCBcBy5GSXTdx1s98umq1pCKR4gQXX24JWvdmuT59RcP-gjKf8hsyAIBlvtrdDwrxXVnGSpRDlsQ";

const SW_URL = "/serwist/sw.js";

export interface FcmTokenResult {
  /** Firebase Installation ID (modern, FID-based registration). Send via the `fid` field of the FCM send API. */
  token: string;
  /** Legacy registration token. Paste this into the Firebase Console "Send test message". */
  legacyToken: string;
  notificationPermission: NotificationPermission;
  /** Re-requests notification permission and re-runs FCM registration when granted. */
  requestPermission: () => Promise<void>;
}

/**
 * Resolves to the service worker that hosts the FCM background-message handler.
 * The Serwist worker is registered at scope "/", so it controls the page and is
 * the registration the push subscription must be attached to. Falls back to
 * `navigator.serviceWorker.ready` when it has not been registered yet.
 */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.ready;
}

export const useFcmToken = (): FcmTokenResult => {
  const [token, setToken] = useState("");
  const [legacyToken, setLegacyToken] = useState("");
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const [retryKey, setRetryKey] = useState(0);

  // Explicit, user-triggered re-request. MUST be called from a real user
  // gesture (a click handler) — since Chrome 80, Chromium silently ignores
  // Notification.requestPermission() when there is no user activation, which
  // is exactly why requesting on page load never showed a prompt.
  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const current = Notification.permission;
    if (current === "granted") {
      // Already allowed — just (re)run FCM registration.
      setRetryKey((key) => key + 1);
      return;
    }

    if (current === "denied") {
      // Browsers will not re-prompt once denied; surface guidance instead.
      console.warn(
        "Notifications are blocked for this site. The browser will not show " +
          "a permission prompt again — the user must reset it manually in " +
          "the site/browser settings (e.g. click the padlock icon in the " +
          "address bar, or brave://settings/content/notifications in Brave).",
      );
      setNotificationPermission("denied");
      return;
    }

    // "default" — inside a user gesture the browser will now show the prompt.
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    // Re-run the effect so registration happens once permission is granted.
    setRetryKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsubscribed: Array<() => void> = [];

    // A re-run (retryKey > 0) happens after the user grants permission later,
    // so reset any previously-obtained identifiers before registering again.
    if (retryKey > 0) {
      setToken("");
      setLegacyToken("");
    }

    const setupMessaging = async (messaging: Messaging) => {
      // Attach the push subscription to the SW that hosts the background handler.
      const serviceWorkerRegistration = await getServiceWorkerRegistration();
      if (!mounted) return;
      console.log("FCM: using service worker", serviceWorkerRegistration.scope, SW_URL);

      // Modern FID-based registration. The FID is delivered via onRegistered(),
      // not as a return value, so the handlers must be wired up before register().
      unsubscribed.push(
        onRegistered(messaging, (fid) => {
          console.log("FCM FID (send API target):", fid);
          if (mounted) setToken(fid);
        }),
        onUnregistered(messaging, () => {
          if (mounted) setToken("");
        }),
      );

      try {
        await register(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration,
        });
      } catch (error) {
        console.error("FCM FID registration failed:", error);
      }

      // Legacy registration token. This is what the Firebase Console
      // "Send test message" dialog expects, so we obtain it for testing.
      try {
        const legacy = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration,
        });
        if (legacy) {
          console.log("FCM legacy token (paste into Firebase Console):", legacy);
          if (mounted) setLegacyToken(legacy);
        }
      } catch (error) {
        console.error("FCM legacy token retrieval failed:", error);
      }
    };

    const run = async () => {
      try {
        if (typeof window === "undefined" || !("Notification" in window)) return;

        // IMPORTANT: Chromium (Chrome/Brave) silently ignores
        // Notification.requestPermission() when it is NOT called from a user
        // gesture. Requesting on page load therefore never shows a prompt and
        // can end up stored as "denied". We only READ the state here; the
        // actual request must happen from the banner button (a real click).
        const current = Notification.permission;
        console.log(
          "FCM: current notification permission for",
          window.location.origin,
          "=",
          current,
        );
        setNotificationPermission(current);

        if (current !== "granted") {
          console.warn(
            "FCM: notification permission is",
            current,
            "for",
            window.location.origin,
            "- waiting for a user gesture to request it (see banner button).",
          );
          return;
        }

        const messaging: Messaging | null = await getFirebaseMessaging();
        if (!messaging) {
          console.warn("FCM messaging is not supported in this browser.");
          return;
        }

        await setupMessaging(messaging);
      } catch (error) {
        console.error("An error occurred while registering with FCM:", error);
      }
    };

    run();

    return () => {
      mounted = false;
      for (const unsubscribe of unsubscribed) {
        unsubscribe();
      }
    };
  }, [retryKey]);

  return { token, legacyToken, notificationPermission, requestPermission };
};
