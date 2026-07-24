/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkFirst, NetworkOnly } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  runtimeCaching: [
    {
      matcher: ({ url }) =>
        url.hostname === "localhost" && url.port === "3009",
      handler: new NetworkOnly(),
    },
    ...defaultCache,
    {
      matcher: ({ request, url }) =>
        request.method === "GET" && url.pathname === "/api/mini-apps",

      handler: new NetworkFirst({
        cacheName: "get-mini-app-api",
        networkTimeoutSeconds: 3,
      }),
    },
  ],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
});

serwist.addEventListeners();
