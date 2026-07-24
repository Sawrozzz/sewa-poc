# Core Platform Packages

## 1. `@sewa/platform-contracts`
**Importance:** ⭐⭐⭐⭐⭐ (5/5)

### What it does
Pure shared type definitions and lightweight utilities used across every package.

Defines the complete platform contract surface, including:

- `PlatformMessage`
- `ModuleManifest`
- `Transport` interface
- `ShellServiceMap`
- `RemoteLoadResult`
- Device types
- Navigation types
- Event schemas
- SDK capabilities

Also provides a few helper utilities such as:

- `createMessage()`
- `isPlatformMessage()`
- `WindowEventTransport`

### Usage in the Host
Imported by every package and by the shell itself.

If this package is missing, nothing compiles because every package depends on these shared contracts.

There is intentionally almost no runtime logic—only shared types and small helper functions.

### Why it matters
This is the foundation of the entire platform.

Every package depends on it and there is no realistic substitute.

---

## 2. `@sewa/event-bus`
**Importance:** ⭐⭐⭐⭐☆ (4/5)

### What it does
Shell-owned publish/subscribe event system.

Features include:

- Middleware chains
- Trace propagation
- Replay buffers for late subscribers
- Metrics collection

Internal shell events flow through this bus, including:

- `module.lifecycle.*`
- `navigation.route.changed`
- `auth.*`

### Usage in the Host
Created once inside `PlatformProvider` and passed to the shell communicator.

Used by:

- `MiniAppContainer` to emit lifecycle events
- The shell for cross-cutting communication
- Internal platform services

Mini apps never communicate with this directly.

### Why it matters
The communicator could technically function using simple callbacks, but this event bus provides proper decoupling between shell components.

It is an important architectural component, although replaceable by a simpler implementation.

---

## 3. `@sewa/auth-sdk`
**Importance:** ⭐⭐⭐⭐☆ (4/5)

### What it does
Framework-agnostic authentication engine.

Core features include:

- Token management
- Automatic refresh
- Session persistence

Also provides React bindings such as:

- `AuthProvider`
- `useAuth()`
- `usePermission()`
- `<RequireAuth>`

### Usage in the Host
Wraps the application through `AuthProvider` inside `GlobalProvider`.

Used by:

- `ModuleGrid`
- `MiniAppContainer`
- Login/logout flows
- Permission checks
- Authentication state management

### Why it matters
The host application requires authentication across nearly every page.

Although the implementation can be replaced thanks to its clean interface, authentication itself is essential.

---

## 4. `@sewa/shell-communicator`
**Importance:** ⭐⭐⭐⭐☆ (4/5)

### What it does
Acts as the privileged bridge between mini apps and shell services.

Responsibilities include:

- Receiving handshake messages
- Handling request/response RPC
- Routing requests to shell services
- Managing connected module state
- Managing event subscriptions
- Supporting cross-module communication

Routes requests to services including:

- Authentication
- Permissions
- Navigation
- Device APIs
- HTTP
- Chat
- Telemetry
- Event APIs

Communication occurs through the `PostMessageTransport`.

### Usage in the Host
Created and initialized once inside `PlatformProvider`.

Also used by `MiniAppContainer` to disconnect modules during cleanup.

Mini app SDKs communicate with the shell exclusively through this package.

### Why it matters
Mini apps cannot access shell functionality directly.

This package is their only gateway into privileged platform services.

Without mini apps this package would not be necessary, but within the current architecture it is critical.

---

## 5. `@sewa/runtime-loader`
**Importance:** ⭐⭐⭐⭐⭐ (5/5)

### What it does
Responsible for dynamically downloading and executing mini apps at runtime.

Capabilities include:

- Downloading ESM bundles from a CDN
- IndexedDB caching with FIFO eviction
- Dynamic evaluation using Blob URLs and `import()`
- Vite manifest parsing
- CSS injection
- Retry handling
- Signature verification

Produces mountable component instances that can be rendered by the shell.

### Usage in the Host
Used directly by `MiniAppContainer`:

```ts
load(moduleId, bundleUrl, version)
```

Responsibilities include:

- Downloading remote bundles
- Reading from cache
- Loading updated versions
- Mounting mini applications

### Why it matters
This package enables the entire runtime plugin architecture.

Without it:

- No mini apps can be downloaded.
- No remote modules can be mounted.
- The shell would require redeployment for every new feature.

It is the core mechanism that makes the super-app architecture possible.