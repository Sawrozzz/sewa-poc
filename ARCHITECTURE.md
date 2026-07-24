# Sewa POC — Shell & Mini App Architecture

## Overview

This document explains how the Shell application works behind the scenes to orchestrate Mini Apps through layered packages and the external Mini App SDK. The architecture enforces strict boundaries: **Mini Apps never access browser/native APIs directly** — all capabilities route through the Shell Communicator.

---

## Package Layer Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SHELL APP (Next.js)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Platform Provider (React Context)               │    │
│  │  ┌─────────┐ ┌───────────┐ ┌──────────────┐ ┌──────────────────┐  │      │
│  │  │Event Bus│ │Host Bridge│ │Module Registry│ │  Runtime Loader  │  │     │
│  │  └────┬────┘ └─────┬─────┘ └──────┬───────┘ └────────┬─────────┘  │      │
│          │            │              │                  │                   │
│  └───────┼────────────┼──────────────┼──────────────────┼────────────┘      │
│  ┌───────┴────────────┴──────────────┴──────────────────┴────────────┐      │
│  │                      Shell Communicator (Privileged Gateway)        │    │
│  │  ┌─────────┐ ┌───────────┐ ┌──────────────┐ ┌──────────────────┐  │      │
│  │  │ Auth    │ │ Permissions│ │ Flags/Config │ │ Navigation/HTTP  │  │     │
│  │  │ Services│ │ Services  │ │ Services     │ │ Services         │  │  │
│  │  └─────────┘ └───────────┘ └──────────────┘ └──────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│          │                                  ▲                            │
│          │ Transport (WindowTransport)       │                            │
│          ▼                                  │                            │
│  ┌──────────────────────────────────────────┴────────────────────────┐  │
│  │                    MINI APP CONTAINER (React)                      │  │
│  │  ┌──────────────┐  ┌─────────────┐  ┌────────────────────────┐   │  │
│  │  │ injectSdk()  │  │  Loader     │  │  Remote Component      │   │  │
│  │  │ (CDN Bridge) │  │ (Federation)│  │  (Vendor Code)         │   │  │
│  │  └──────────────┘  └─────────────┘  └────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            ┌─────────────────┐             ┌─────────────────┐
            │  WEB (Browser)  │             │  FLUTTER (Native)│
            │  WebHostBridge  │             │ FlutterHostBridge│
            │ navigator.* APIs│             │  postMessage()   │
            └─────────────────┘             └─────────────────┘
```

---

## Core Packages (Layered from Bottom to Top)

### 1. `@sewa/platform-contracts` — **Foundation Layer**

**Location:** `packages/platform-contracts/`

Shared types and contracts used by ALL layers. No runtime code — only TypeScript interfaces.

**Key Exports:**

| Module | Purpose |
|--------|---------|
| `events.ts` | Event schema (`PlatformEvent`), canonical event names (`PLATFORM_EVENTS`), event factory |
| `module.ts` | `ModuleManifest`, `ModuleRegistration`, `ModuleStatus`, `RemoteLoadResult`, version negotiation |
| `sdk.ts` | `MiniAppSdkInterface` (what mini apps see), `ShellServices` (what Shell implements), device result types |
| `transport.ts` | `Transport` interface, `WindowTransport` (same-window), `PostMessageTransport` (cross-window) |
| `communication.ts` | `PlatformMessage` wire format, `createMessage()`, `isPlatformMessage()` |

**Design Principle:** Mini Apps import ONLY from `@sewa/platform-contracts` for types. They NEVER import Shell internals.

---

### 2. `@sewa/host-bridge` — **Platform Abstraction Layer**

**Location:** `packages/host-bridge/`

Abstracts device capabilities behind a unified `HostBridge` interface. Two implementations:

| Class | Platform | Mechanism |
|-------|----------|-----------|
| `WebHostBridge` | WEB | Direct browser APIs (`navigator.geolocation`, `mediaDevices`, `localStorage`, `PublicKeyCredential`) |
| `FlutterHostBridge` | ANDROID/IOS | Delegates to Flutter container via `window.__GOV_FLUTTER_BRIDGE__.postMessage()` + callback |

**Flow:**
```
Mini App → SDK → Shell Communicator → HostBridge.invokeDevice() → WebHostBridge/FlutterHostBridge
```

**Key File:** `src/index.ts:369` — `createHostBridge()` auto-detects platform via `window.__GOV_FLUTTER_BRIDGE__`.

---

### 3. `@sewa/module-registry` — **Runtime Manifest Registry**

**Location:** `packages/module-registry/`

Manages vendor module manifests **at runtime**. No Shell redeployment needed when vendors deploy new versions.

**Responsibilities:**
- Register manifests (`register()`, `registerMany()`)
- Version negotiation (`negotiateVersion()`) — checks `minShellVersion`, `minSdkVersion`, `supportedPlatforms`
- Status tracking: `registered` → `loading` → `loaded` | `failed` | `disabled` | `incompatible`
- Query: `getEnabled()`, `getByVendor()`, `getByCategory()`

**Key File:** `src/index.ts:126` — `fetchAndRegister(manifestUrl)` enables dynamic manifest fetching from vendor CDNs.

---

### 4. `@sewa/runtime-loader` — **Module Federation Loader**

**Location:** `packages/runtime-loader/`

Loads vendor remote modules via **Module Federation** at runtime.

**Flow:**
```
1. Registry provides ModuleManifest (remoteEntryUrl, remoteName, exposedModule)
2. RuntimeLoader.registerRemotes() with MF Enhanced
3. mf.loadRemote(`${remoteName}/${exposedModule}`)
4. resolveRemoteComponent() extracts React component
5. Cache in loadedModules Map
```

**Key File:** `src/index.ts:146` — `loadFederation()` handles remote registration + component resolution with retry logic.

---

### 5. `@sewa/shell-communicator` — **Privileged Gateway**

**Location:** `packages/shell-communicator/`

**The single choke point** — ALL Mini App SDK calls route here. Validates, traces, authorizes, and executes.

**Message Protocol:**
```
Mini App SDK → Transport → ShellCommunicator.handleMessage()
  → routeRequest() → switch on "namespace.action"
  → ShellServices / HostBridge / EventBus
  → Response via Transport
```

**Namespaces Handled:**
| Namespace | Actions |
|-----------|---------|
| `auth` | `getUser`, `isAuthenticated`, `logout` |
| `permissions` | `has`, `list` |
| `flags` | `isEnabled`, `getAll` |
| `config` | `get`, `getAll` |
| `navigation` | `navigate`, `getCurrent` |
| `telemetry` | `log`, `track`, `error` |
| `platform` | `getType`, `isWeb`, `isAndroid`, `isIOS`, `isMobile` |
| `device` | `location`, `camera`, `gallery`, `files`, `biometric`, `notifications`, `network`, `storage`, `info` |
| `http` | `get`, `post`, `put`, `patch`, `delete` (proxied via axios) |
| `event` | `subscribe`, `unsubscribe`, `emit` |
| `sdk` | `invoke` (RPC to other mini apps), `register` (expose service) |

**Security:** `isMethodAllowed()` checks module capabilities against `SDK_CAPABILITIES` from contracts.

---

### 6. `@sewa/event-bus` — **Internal Event Distribution**

**Location:** `packages/event-bus/` (inferred from imports)

In-memory pub/sub with tracing support. Used by Shell Communicator to broadcast:
- `navigation.route.changed` → all connected modules
- `module.lifecycle.loaded/failed/unloaded` → telemetry
- Custom events via `event.emit` from mini apps

---

## Shell Platform Layer (Application Code)

**Location:** `shell/src/platform/`

### `PlatformProvider.tsx` — **Bootstrap Orchestrator**

Initializes ALL subsystems in a single React Context:

```typescript
// PlatformProvider.tsx:42-122
const eventBus = createEventBus({...})
const hostBridge = createHostBridge()           // Detects WEB/ANDROID/IOS
const services = createShellServices(authConfig) // Implements ShellServices
const registry = createModuleRegistry({ platform: hostBridge.platformType })
seedModuleRegistry(registry)                     // Fetches manifests from /api/mini-apps
const loader = createRuntimeLoader({ registry, ... })
const communicator = createShellCommunicator({ services, eventBus, hostBridge, ... })
await communicator.initialize()
```

Provides via Context: `eventBus`, `hostBridge`, `communicator`, `registry`, `loader`, `services`.

---

### `platform-bridge.ts` — **Transport Installer**

Installs `WindowTransport` for **same-window** Module Federation mini apps:

```typescript
// platform-bridge.ts:14-19
export function getPlatformTransport(): Transport {
  if (!transportInstance) transportInstance = new WindowTransport()
  return transportInstance
}
```

Mini App SDK (loaded from CDN) calls `window.getMiniAppBridge()` which uses this transport.

---

### `sdk-injection.ts` — **SDK Instance Manager**

Delegates to the **CDN-loaded Mini App Bridge** (`window.getMiniAppBridge()`):

```typescript
// sdk-injection.ts:17-28
export async function injectSdk(moduleId: string): Promise<void> {
  const bridge = getBridge() // window.getMiniAppBridge()
  await bridge.createInstance(moduleId) // Creates isolated SDK instance per module
}
```

Called **BEFORE** Module Federation load so SDK is ready when vendor code executes.

---

### `services.ts` — **ShellServices Implementation**

Concrete implementations of `ShellServices` interface from contracts:

| Service | Backing |
|---------|---------|
| `auth` | Delegates to `PlatformServicesConfig.getUser()/logout()` |
| `permissions` | Reads from user.permissions |
| `flags` | In-memory `defaultFlags` + `moduleFlags` |
| `config` | `globalConfig` (env) + `moduleConfig` (per-module) |
| `navigation` | Updates React Router + notifies handlers |
| `telemetry` | Console logging + in-memory metrics |

---

### `module-seed.ts` — **Dynamic Manifest Seeding**

Fetches mini app manifests from **Shell's own API** at bootstrap:

```typescript
// module-seed.ts:181-234
const response = await fetch('/api/mini-apps')
const manifests = result.map(app => ({
  id: app.miniAppId,
  remoteName: app.miniAppId.replace(/-/g, '_'),
  remoteEntryUrl: `${app.pluginBaseUrl}/remoteEntry.js`,
  exposedModule: './App',
  loadStrategy: 'federation',
  // ... compatibility matrix
}))
registry.registerMany(manifests)
```

**Key:** Vendors deploy `remoteEntry.js` to their CDN independently. Shell only needs the manifest URL.

---

### `SdkLoader.tsx` — **CDN SDK Loader**

Loads the **external Mini App SDK** from CDN at host startup:

```typescript
// SdkLoader.tsx:15-34
fetch('/api/config') → gets sdkCdnUrl
→ <script src={sdkCdnUrl}> → window.getMiniAppBridge() available
```

---

## Mini App Container — **Runtime Integration**

**Location:** `shell/src/components/MiniAppContainer.tsx`

Orchestrates the full load sequence for a mini app route:

```
MiniAppContainer(moduleId="driving-license")
│
├─ 1. Check registry + permissions
│
├─ 2. installPlatformBridge()           // Sets up WindowTransport
│
├─ 3. injectSdk(moduleId)               // Creates SDK instance via CDN bridge
│
├─ 4. loader.load(moduleId)             // Module Federation load
│     └─ RuntimeLoader.loadFederation()
│          └─ mf.loadRemote() → React Component
│
├─ 5. Render <RemoteApp /> inside ErrorBoundary
│
└─ Cleanup on unmount:
     uninstallSdk(), uninstallPlatformBridge(), loader.unload(), communicator.disconnectModule()
```

---

## External Mini App SDK (CDN)

**Not in this repo** — deployed separately to CDN.

**Responsibilities:**
- Exposes `window.getMiniAppBridge()` → `MiniAppBridge` class
- `MiniAppBridge.createInstance(moduleId)` → creates `MiniAppSdk` instance
- `MiniAppSdk` implements `MiniAppSdkInterface` from `@sewa/platform-contracts`
- All SDK methods → `transport.send(PlatformMessage)` → Shell Communicator
- Uses `WindowTransport` (same-window) or `PostMessageTransport` (iframe)

**Mini App Vendor Code:**
```typescript
// Vendor's mini app (loaded via Module Federation)
import { createMiniAppSdk } from '@sewa/mini-app-sdk'

const sdk = createMiniAppSdk() // Gets instance from bridge
const user = await sdk.auth.getUser()
const location = await sdk.device.location({ highAccuracy: true })
await sdk.navigation.navigate({ app: 'revenue-license', route: '/pay' })
```

---

## Complete Request Flow: Mini App → Device Capability

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Mini App   │     │  Mini App    │     │  WindowTransport │
│  (Vendor)   │────▶│  SDK         │────▶│  (CustomEvent)   │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                   │
                                                   ▼
                                          ┌──────────────────┐
                                          │ ShellCommunicator│
                                          │ .handleMessage() │
                                          └────────┬─────────┘
                                                   │
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                        ┌───────────┐       ┌──────────────┐      ┌──────────┐
                        │  Route    │       │  Validate    │      │  Trace   │
                        │ "device.  │       │ capabilities │      │  (traceId│
                        │  location"│       │ + permissions│      │  per req)│
                        └─────┬─────┘       └──────┬───────┘      └──────────┘
                              │                    │
                              ▼                    ▼
                        ┌─────────────────────────────────────┐
                        │      HostBridge.invokeDevice()      │
                        │   (WebHostBridge / FlutterHostBridge)│
                        └──────────────────┬──────────────────┘
                                           │
                              ┌────────────┴────────────┐
                              ▼                         ▼
                        ┌─────────────┐           ┌───────────────┐
                        │ navigator.  │           │ Flutter Bridge│
                        │ geolocation │           │ postMessage() │
                        │ .getCurrent │           │  (native)     │
                        │ Position()  │           └───────────────┘
                        └──────┬──────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ DeviceResponse   │
                        │ {success, data}  │
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Response Message │
                        │ → Transport      │
                        │ → Mini App SDK   │
                        │ → Promise resolves│
                        └──────────────────┘
```

---

## Key Architectural Invariants

1. **Mini Apps NEVER call browser APIs directly** — All device access via `sdk.device.*` → Shell Communicator → HostBridge
2. **Mini Apps NEVER call `window.postMessage`** — All communication via `Transport` abstraction (injected by Shell)
3. **Shell NEVER bundles vendor code** — Vendors deploy `remoteEntry.js` independently; Shell loads via Module Federation at runtime
4. **Version negotiation at registration** — `ModuleRegistry.negotiateVersion()` blocks incompatible modules before load
5. **Per-module SDK isolation** — `injectSdk(moduleId)` creates separate SDK instance per mini app
6. **Traceability** — Every request carries `traceId` through SDK → Communicator → HostBridge → Response

---

## Adding a New Mini App (Vendor Perspective)

1. Build React app with Module Federation config exposing `./App`
2. Deploy `remoteEntry.js` + chunks to CDN
3. Provide manifest JSON to Shell admin API (`/api/mini-apps`)
4. Shell fetches manifest at bootstrap, registers in `ModuleRegistry`
5. User navigates to `/mini-app/{slug}` → `MiniAppContainer` loads via Federation
6. Vendor code receives `sdk` instance — calls only `sdk.*` methods

---

## File Reference Quick Links

| Area | Key Files |
|------|-----------|
| Contracts | `packages/platform-contracts/src/{events,module,sdk,transport,communication}.ts` |
| Host Bridge | `packages/host-bridge/src/index.ts` (WebHostBridge, FlutterHostBridge) |
| Module Registry | `packages/module-registry/src/index.ts` |
| Runtime Loader | `packages/runtime-loader/src/index.ts` |
| Shell Communicator | `packages/shell-communicator/src/index.ts` |
| Platform Provider | `shell/src/platform/PlatformProvider.tsx` |
| Platform Bridge | `shell/src/platform/platform-bridge.ts` |
| SDK Injection | `shell/src/platform/sdk-injection.ts` |
| Shell Services | `shell/src/platform/services.ts` |
| Module Seeding | `shell/src/platform/module-seed.ts` |
| SDK Loader | `shell/src/platform/SdkLoader.tsx` |
| Mini App Container | `shell/src/components/MiniAppContainer.tsx` |
| Route Handler | `shell/src/app/mini-app/[slug]/page.tsx` |