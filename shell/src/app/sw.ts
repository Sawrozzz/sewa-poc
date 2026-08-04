/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, NetworkOnly, NavigationRoute, PrecacheFallbackPlugin, StaleWhileRevalidate, ExpirationPlugin } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Remove the catch-all NetworkOnly from defaultCache so our NavigationRoute handles navigation
const filteredDefaultCache = defaultCache.filter(
  (entry) => !(entry.matcher instanceof RegExp && entry.matcher.source === ".*" && entry.method === "GET" && entry.handler.constructor.name === "NetworkOnly")
) as RuntimeCaching[];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  runtimeCaching: [
    {
      matcher: ({ url }) =>
        url.hostname === "localhost" && url.port === "3009",
      handler: new NetworkOnly(),
    },
    ...filteredDefaultCache,
    {
      matcher: ({ request, url }) =>
        request.method === "GET" && url.pathname === "/api/mini-apps",
      handler: new NetworkFirst({
        cacheName: "get-mini-app-api",
        networkTimeoutSeconds: 3,
      }),
    },
    {
      matcher: ({ request, url }) =>
        request.method === "GET" && url.pathname === "/api/config",
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
      matcher: ({ request, url }) =>
        request.method === "GET" && url.pathname === "/api/modules",
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
      matcher: ({ request, url }) =>
        request.method === "GET" && url.pathname === "/api/data",
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

const navigationRoute = new NavigationRoute(
  (options) => navigationHandler.handle(options),
  {
    allowlist: [/^\/((?!api\/|_next\/|serwist\/|icons\/).)*$/],
  }
);

serwist.registerRoute(navigationRoute);
serwist.addEventListeners();
