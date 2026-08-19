// lib/firebase.ts
import { initializeApp } from "firebase/app";
import type { Messaging } from "firebase/messaging";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBh3xfl0WTb3oHLdS2Tu2-ccHaeLvSz-JA",
  authDomain: "sewa-66120.firebaseapp.com",
  projectId: "sewa-66120",
  storageBucket: "sewa-66120.firebasestorage.app",
  messagingSenderId: "955158033019",
  appId: "1:955158033019:web:c86d1d3288aa8c5e9d28de",
  measurementId: "G-JRFNB4XMRL",
};

export const firebaseApp = initializeApp(firebaseConfig);

let messagingPromise: Promise<Messaging | null> | null = null;

/**
 * Resolves to the Firebase Messaging instance on the client, or `null` when
 * running server-side or on a browser that does not support FCM (e.g. Firefox).
 */
export function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  messagingPromise ??= isSupported().then((supported) =>
    supported ? getMessaging(firebaseApp) : null,
  );

  return messagingPromise;
}
