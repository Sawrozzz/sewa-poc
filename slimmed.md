# Slimmed Host Code — Suggestions & Implemented Changes

This document records the analysis, recommendations, and implemented changes
for reducing/optimizing the host-side code in `sewa-poc/` that communicates
with the Mini App SDK (`@lizuz/sewa-sdk` / `mini-app-sdk/`).

The guiding principle: **the SDK is the client half of the RPC protocol; the
host is the server half.** The host's job is to answer SDK calls — handshake,
`namespace.action` methods, event broadcast. Code that the SDK never invokes,
or that duplicates what the SDK already handles, is dead weight.

---

## 1. Suggestions (the analysis)

### 1.1 `packages/host-platform` (~2,500 LOC → ~600–700 reducible)

The SDK never calls these, and several are protocol-incompatible with it:

| Dead / duplicated code | LOC | Why it can go |
|---|---|---|
| `stream` message type + `ai.chat` streaming | ~90 | SDK has no `ai` module, and its validator rejects `stream`-type messages outright |
| `sdk.invoke` / `sdk.register` cross-module forwarding + `pendingRequests` | ~120 | No SDK module or mini-app calls it |
| `WindowEventTransport` | 40 | Mismatched event name (`gov-platform-sdk` vs SDK's `gov-platform-event`); non-functional — shell uses `PostMessageTransport` anyway |
| Unused `EventBus` halves (middleware, replay, metrics, schema registry) | ~150 | Only `emit` / `subscribe('*')` / `cleanup` are used |
| `platform.isWeb/isAndroid/isIOS/isMobile`, `device.storage`, `event.unsubscribe` | ~30 | SDK resolves these locally or never sends them |
| `negotiateVersion`, unused validators (`isPlatformMessage`/`isStreamMessage`), unused `MethodRegistry` surface | ~100 | Written, never read; SDK does version check + capability filtering client-side |

Also: `message-factory.ts` and the two constants files (~100 LOC) hand-mirror
the SDK because `@lizuz/mini-app-types` ships types-only. Publishing runtime
values from the types package would delete them entirely.

### 1.2 `shell/` (~1,500 LOC direct wiring, ~400 reducible)

- **sdk-bootstrap 446 → ~140 LOC.** The SDK only hard-requires: seed
  `window.__GSA_SDK__ = { miniAppId }`, inject the script, `await initialize()`.
  Drop the multi-source fallback list, the re-seed-per-source loop, and the DI
  seam (~100 LOC + ~110 LOC of tests).
- **`createMiniAppRuntime()` in `MiniAppContainer` is dead** (~35 LOC) — the
  current mini-apps get the SDK via their own embedded bridge, not mount props.
- **`services/http.ts`** duplicates the axios-based `handleHttpRequest` already
  inside `rpc-server.ts` for the same `http.*`/`api.*` namespaces — one of the
  two HTTP stacks should go.
- **Capability/global-key constants** duplicated between `sdk-bootstrap/constants.ts`,
  `rpc-server.ts`, and `protocol.constants.ts` — import from one place.

### 1.3 Not reducible

- The `services/` (~1,300 LOC) are mostly real feature logic (WebAuthn, file
  pickers, SSE chat) that exists only because the SDK protocol exposes those
  namespaces.
- `host-guard`/`host-privileges` (~183 LOC) only disappear if mini-apps switch
  to iframe isolation.

---

## 2. Implemented changes

Net result: **~1,030 LOC removed** across 27 files (+119 / −1151).
Verified: `turbo lint` (3/3), `turbo build` (3/3), `shell test` (10/10 pass).

### 2.1 `packages/host-platform`

- **`protocol/message.types.ts`** — removed `stream` extension
  (`HostMessageType`, `StreamMessageFields`, stream fields in
  `CreateMessageOptions`). `HostPlatformMessage` is now just `PlatformMessage<T>`.
- **`protocol/message-factory.ts`** — removed stream fields; uses canonical
  `MessageType`.
- **`protocol/message-validator.ts`** — removed `isPlatformMessage` /
  `isStreamMessage` (never imported). Kept `splitEventType`.
- **`protocol/index.ts`** — exports updated to match.
- **`transport/transport.ts`** — removed `SDK_CHANNEL_EVENT`.
- **`transport/window-event-transport.ts`** — **file deleted.**
- **`transport/index.ts`** — `WindowEventTransport` and `SDK_CHANNEL_EVENT`
  no longer exported.
- **`events/event-bus.ts`** — removed middleware pipeline (`use`), replay
  buffer, metrics/throughput, schema registry (`registerSchema`/`getRegistry`/
  `registerDefaultSchemas`). Kept `emit`/`publish`/`subscribe`/`unsubscribe`/
  `cleanup`/`destroy`/`onError`/`enableTracing`.
- **`events/platform-event.ts`** — removed `EventSchema` / `EventRegistryEntry`.
- **`events/index.ts`** — exports trimmed (`EventMiddleware`, `EventBusMetrics`,
  schema types removed).
- **`rpc/method-registry.ts`** — removed `onUnknownMethod`, `resolve`, `has`,
  `listMethods`, `namespaces`. Kept `register`/`registerMethod`/`invoke`.
- **`rpc/rpc-server.ts`** — 977 → 614 LOC:
  - Removed `ai.chat` + `streamChatChunks`.
  - Removed `sdk.invoke` / `sdk.register` / `findServiceModule` /
    `forwardToModule` / `pendingRequests` / `ServiceEntry`.
  - Removed `platform.isWeb/isAndroid/isIOS/isMobile`.
  - Removed `device.storage`.
  - Removed `event.unsubscribe` (SDK never sends it).
  - Removed `negotiateVersion` + `negotiatedVersion` field.
  - Removed `response`-type handling in `handleMessage` (only
    `request`/`handshake` inbound now).
  - Default transport is now `PostMessageTransport`.
  - `HOST_EXTRA_CAPABILITIES` reduced to `['event']` (dropped `ai`/`sdk`).
- **`types/sdk.types.ts`** — removed `ShellApiService`, `ApiRequestParams`,
  `ChatMessage`, `ChatSdkModule`, `ModelCompletionOptions`.
- **`types/services.types.ts`** — removed `chat`, `http`, `api` from
  `ShellServiceMap`; removed `ShellChatService`, `ShellHttpService`;
  removed `storage` from `ShellDeviceService`. `http`/`api` are served by the
  RpcServer itself via axios, so the shell does not re-implement them.
- **`types/module.types.ts`** — removed `chat` and device `storage` from
  `PluginServices`.

### 2.2 `shell/`

- **`platform/sdk-bootstrap/constants.ts`** — `SDK_GLOBAL_KEY`,
  `HOST_DESCRIPTOR_GLOBAL_KEY`, `SDK_CAPABILITIES` now imported from
  `@sewa/host-platform` instead of re-declared. `DEFAULT_SDK_SOURCES` list →
  single `DEFAULT_SDK_SOURCE` (`/sdk/sewa-sdk.min.js`).
- **`platform/sdk-bootstrap/core.ts`** — removed the multi-source fallback loop
  and re-seed-per-source behavior. Now: reuse existing instance OR
  seed → load single source → read instance → `initialize()`.
- **`platform/sdk-bootstrap/types.ts`** — `sources` option → single `source`.
- **`platform/sdk-bootstrap/core.test.ts`** — rewritten for single-source
  behavior (10 tests, all passing).
- **`components/MiniAppContainer.tsx`** — removed dead `createMiniAppRuntime` /
  `SDKBridge` / `Runtime`. Mount is now simply `loadedModule.bundle.mount(container)`.
- **`platform/services/http.ts`** — reduced to `createStorageService()` only
  (storage); removed the duplicate `http`/`api` fetch implementations.
- **`platform/services/index.ts`** — removed `chat` service and the `http`/`api`
  entries from the returned service map.
- **`platform/services/device.ts`** — removed the dead `storage` block.
- **`types/services.ts`** — removed `LocalApiRequestParams` / `LocalApiResult`.

---

## 3. Notes & caveats

- `shell/next-env.d.ts` was touched by `next build` (auto-generated, not a
  manual edit).
- The `/api/chat` route still exists in the shell but nothing calls it now
  (the `chat` service was removed); left untouched per scope.
- Mini-app bundles were **not** modified — they are currently unused and
  self-bootstrap via their embedded (older) SDK bridge
  (`window.getMiniAppBridge()`).
- If the SDK's capability surface grows again (e.g. an `ai` module lands),
  re-add the corresponding host handlers and re-advertise the capability.
