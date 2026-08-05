# windowUpdate — Mini App SDK Bootstrap Refactor

Status of the current change set (`HEAD 1f58b66`, "sdk host added to different file").

## What changed

The Mini App SDK bootstrap logic was extracted out of `MiniAppContainer.tsx`
into a dedicated, testable host module and rewired back into the component.

| File | Change |
| --- | --- |
| `shell/src/platform/mini-app-sdk-host.ts` | **new** — host-side bootstrap module (seed config, load bundle with fallback, read live instance, destroy). Environment-injected core, browser adapters on top. |
| `shell/src/platform/mini-app-sdk-host.test.ts` | **new** — 10 unit tests via `node:test`, no DOM, no new dependencies. |
| `shell/src/components/MiniAppContainer.tsx` | Refactored to call `loadMiniAppSdk()` / `destroyMiniAppSdk()`; removed inline `__GSA_SDK__` seeding, CDN URL, and the local `getSdkInstance()` helper. |
| `shell/package.json` | Added `test` script; declared `@lizuz/mini-app-types@^1.0.9` (dev) so the shell resolves the SDK types directly. |
| `shell/tsconfig.json` | Enabled `allowImportingTsExtensions` (required for Node's native TS test execution). |
| `pnpm-lock.yaml` | Lockfile updated for the new dev dependency. |

## How it works (contract)

1. Host seeds `window.__GSA_SDK__` with `MiniAppSdkOptions` and
   `window.__GSA_HOST_DESCRIPTOR__` with the host descriptor **before** the SDK
   bundle evaluates.
2. The SDK bundle reads the config, constructs a single `MiniAppSdk`, and stores
   the live instance back on the same key.
3. Host reads the instance via `readSdkInstance()` and `await sdk.initialize()`
   (idempotent) so the handshake completes before the mini-app bundle mounts.
4. Bundle sources are tried in order: self-hosted
   `/sdk/sewa-sdk.min.js` (known-good sha256 `02b06abe…`) first, then
   jsdelivr `@lizuz/sewa-sdk@1.0.2` as fallback (that artifact is a stale
   pre-refactor build, hence self-hosting preferred).
5. `destroyMiniAppSdk()` tears the instance down; `MiniAppSdk.destroy()`
   removes it from the global again.

## Pros

- **Correct API surface** — drives the real `MiniAppSdk` (`initialize()` /
  `destroy()`), not the removed legacy `getMiniAppBridge()` / `createInstance()`.
- **No bootstrap race** — config is seeded before the bundle evals; awaiting
  `initialize()` guarantees the handshake finished before the mini app mounts.
- **Self-healing fallback** — first working bundle source wins; per-source
  failure details are included in the error message.
- **Testable core** — `bootstrapMiniAppSdk` takes an injected `SdkBootstrapEnv`
  (window / loadScript / now), so logic is unit-tested without a browser.
  10/10 tests pass; zero new runtime/test dependencies.
- **Single source of truth** — protocol keys (`__GSA_SDK__`,
  `__GSA_HOST_DESCRIPTOR__`), capabilities, and source list live in one module
  instead of hardcoded literals in components.
- **Catches silent breakage** — a bundle that throws during eval fires
  `script.onload` but leaves no instance; the `ErrorEvent` trap rejects instead
  of letting a silently-broken bundle through.
- **Idempotent + clean teardown** — reuses an existing instance, guards via
  `sdkLoaded`, and `destroy` no-ops safely on double-unmount.

## Cons / trade-offs

- **One instance per tab** — the `__GSA_SDK__` CDN path is global; only one
  active mini app SDK per window. Concurrent mini apps need a future migration
  to programmatic per-instance `MiniAppSdk` with injected transport.
- **Global-key coupling** — the two window keys must stay in sync with the
  SDK's own constants by hand; a rename in the SDK requires a coordinated
  bump here (documented in the module header).
- **Type dependency added** — the shell now declares `@lizuz/mini-app-types`
  directly; keeps `tsc` green but adds a pinned-version maintenance surface.
- **`sdkLoaded` not reset on teardown** — if the component unmounts and the SDK
  is destroyed, a remount that skips `initMiniAppBridge` (because the ref is
  still true) would run without an SDK; current flows re-mount via full route
  nav so this hasn't bitten, but it is a latent edge.
- **Fallback still points at a stale artifact** — jsdelivr `@lizuz/sewa-sdk@1.0.2`
  is known-broken (pre-refactor build); it exists only as a safety net and
  should be re-pointed to the correct version once published.

## Verification

- `pnpm test` → 10/10 pass.
- `npx tsc --noEmit` → only the known pre-existing stale
  `.next/types/validator.ts` error (references a deleted `[slug]/route`) remains.
