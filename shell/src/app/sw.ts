/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import { initializeApp } from "firebase/app";
import type { MessagePayload } from "firebase/messaging/sw";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  ExpirationPlugin,
  NavigationRoute,
  NetworkFirst,
  NetworkOnly,
  PrecacheFallbackPlugin,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// --- FCM (Firebase Cloud Messaging) -----------------------------------------
// The Firebase app must be initialized inside the worker so background push
// messages are handled here. Register the notification-click handler BEFORE
// calling getMessaging(), otherwise FCM may overwrite the custom behavior.

initializeApp({
  apiKey: "AIzaSyBh3xfl0WTb3oHLdS2Tu2-ccHaeLvSz-JA",
  authDomain: "sewa-66120.firebaseapp.com",
  projectId: "sewa-66120",
  storageBucket: "sewa-66120.firebasestorage.app",
  messagingSenderId: "955158033019",
  appId: "1:955158033019:web:c86d1d3288aa8c5e9d28de",
  measurementId: "G-JRFNB4XMRL",
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

const fcmMessaging = getMessaging();

onBackgroundMessage(fcmMessaging, (payload: MessagePayload) => {
  // FCM already auto-displays background notifications when the payload has a
  // `notification` object, so do NOT call showNotification() here — that would
  // show a duplicate. This hook is only for side effects (e.g. data handling).
  console.log("[sw] FCM background message:", payload);
});

// --- Serwist PWA worker ------------------------------------------------------

// Remove the catch-all NetworkOnly from defaultCache so our NavigationRoute handles navigation
const filteredDefaultCache = defaultCache.filter(
  (entry) =>
    !(
      entry.matcher instanceof RegExp &&
      entry.matcher.source === ".*" &&
      entry.method === "GET" &&
      entry.handler.constructor.name === "NetworkOnly"
    ),
) as RuntimeCaching[];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  runtimeCaching: [
    {
      matcher: ({ url }) => url.hostname === "localhost" && url.port === "3009",
      handler: new NetworkOnly(),
    },
    ...filteredDefaultCache,
    {
      matcher: ({ request, url }) => request.method === "GET" && url.pathname === "/api/manifests",
      handler: new NetworkFirst({
        cacheName: "get-mini-app-api",
        networkTimeoutSeconds: 3,
      }),
    },
    {
      matcher: ({ request, url }) => request.method === "GET" && url.pathname === "/api/config",
      handler: new StaleWhileRevalidate({
        cacheName: "app-config",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 4,
            maxAgeSeconds: 7 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    {
      matcher: ({ request, url }) => request.method === "GET" && url.pathname === "/api/modules",
      handler: new StaleWhileRevalidate({
        cacheName: "modules-list",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 16,
            maxAgeSeconds: 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    {
      matcher: ({ request, url }) => request.method === "GET" && url.pathname === "/api/data",
      handler: new NetworkFirst({
        cacheName: "app-data",
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 16,
            maxAgeSeconds: 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
  ],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
});

const navigationHandler = new NetworkFirst({
  cacheName: "pages",
  plugins: [
    new PrecacheFallbackPlugin({
      fallbackUrls: ["/~offline"],
      serwist,
    }),
  ],
});

const navigationRoute = new NavigationRoute((options) => navigationHandler.handle(options), {
  allowlist: [/^\/((?!api\/|_next\/|serwist\/|icons\/).)*$/],
});

serwist.registerRoute(navigationRoute);
serwist.addEventListeners();
