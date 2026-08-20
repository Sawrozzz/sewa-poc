"use client";

import type { MessagePayload } from "firebase/messaging";
import { onMessage } from "firebase/messaging";
import { useEffect } from "react";
import { getFirebaseMessaging } from "@/lib/firebase";
import { privileged } from "@/platform/host-privileges";

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
          if ("Notification" in window && privileged.notification?.permission() === "granted") {
            new Notification(title, { body, icon: "/icons/icon-192.png" });
          }
          const notificationAudio = new Audio("/notification.mp3");
          notificationAudio.volume = 1;
          notificationAudio.play().catch((error) => {
            console.warn("Could not play notification sound", error);
            
          })
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
