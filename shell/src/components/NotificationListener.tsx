"use client";

import type { MessagePayload } from "firebase/messaging";
import { onMessage } from "firebase/messaging";
import { useEffect } from "react";
import { getFirebaseMessaging } from "@/lib/firebase";

export default function NotificationListener() {
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const listen = async () => {
      const messaging = await getFirebaseMessaging();
      if (!messaging || cancelled) return;

      unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
        console.log("Foreground message received:", payload);
        if (payload.notification) {
          const title = payload.notification.title ?? "Sewa";
          const body = payload.notification.body ?? "";
          // Surface the message to the user immediately.
          window.alert(`${title}\n${body}`);
          if ("Notification" in window) {
            new Notification(title, {
              body,
              icon: "/icons/icon-192.png",
            });
          }
        }
      });
    };

    listen();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return null;
}
