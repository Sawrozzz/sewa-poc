"use client";

import type { Messaging } from "firebase/messaging";
import { onRegistered, onUnregistered, register } from "firebase/messaging";
import { useCallback, useEffect, useState } from "react";
import { getFirebaseMessaging } from "./firebase";

const VAPID_KEY =
  "BP3sLmCB0CMSCBcBy5GSXTdx1s98umq1pCKR4gQXX24JWvdmuT59RcP-gjKf8hsyAIBlvtrdDwrxXVnGSpRDlsQ";

const SW_URL = "/serwist/sw.js";

export interface FcmTokenResult {
  /** Firebase Installation ID (modern, FID-based registration). Send via the `fid` field of the FCM send API. */
  token: string;
  notificationPermission: NotificationPermission;
  /** Re-requests notification permission and re-runs FCM registration when granted. */
  requestPermission: () => Promise<void>;
}

/**
 * Resolves to the service worker that hosts the FCM background-message handler.
 * The Serwist worker is registered at scope "/", so it controls the page and is
 * the registration the push subscription must be attached to.
 *
 * IMPORTANT: Chromium aborts `pushManager.subscribe()` with "Registration
 * failed - push service error" when it runs against a registration whose
 * worker is still installing/activating (or was just replaced by an update).
 * `navigator.serviceWorker.ready` only resolves once a worker is active and
 * controls the page, so wait for it BEFORE touching `pushManager`.
 */
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const ready = await navigator.serviceWorker.ready;
  console.log("FCM: service worker active", { scope: ready.scope, state: ready.active?.state });
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? ready;
}

export const useFcmToken = (): FcmTokenResult => {
  const [token, setToken] = useState("");
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
    };

    const run = async () => {
      try {
        if (typeof window === "undefined" || !("Notification" in window)) return;

        let current = Notification.permission;
        console.log(
          "FCM: current notification permission for",
          window.location.origin,
          "=",
          current,
        );
        setNotificationPermission(current);

        if (current === "default") {
          // Prompt on app mount. NOTE: Chromium silently ignores
          // Notification.requestPermission() without a user gesture (it
          // resolves "default" and shows nothing) — in that case the banner
          // button is the fallback that supplies the required gesture.
          current = await Notification.requestPermission();
          setNotificationPermission(current);
        }

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

  return { token, notificationPermission, requestPermission };
};
