# Signed Manifest & Zipped Bundle Loading

How mini apps published through the **signed manifest registry** are verified,
downloaded, unpacked, cached, and mounted — and how that sits alongside the
existing pre-installed (fallback) flow, which is unchanged.

---

## 1. The two flows

| | Fallback (old) | Registry (new) |
|---|---|---|
| Descriptor source | `FALLBACK_MINI_APPS` in `mock-mini-apps.ts` | `/api/manifests` signed manifest |
| `bundleUrl` points at | a directory (`https://app.vercel.app/`) | a `.zip` archive |
| Files obtained by | fetching `manifest.json`, then each file over HTTP | downloading one archive and unzipping it in the browser |
| Integrity | none | SHA-256 of the archive vs `bundleHash` |
| Route | `/<miniAppId>` | `/<miniAppId>?source=registry` |
| Loader entry point | `loader.load()` | `loader.loadBundle()` |
| IndexedDB namespace | `<miniAppId>/…` | `<miniAppId>@bundle/…` |
| Cache key | `__version__` | `__bundleHash__` |

The two lists can contain the **same id** (`test-mini-app` exists in both), which
is why the route carries an explicit `?source=registry` and why the cache
namespaces are separate — neither flow can read or evict the other's files.

---

## 2. End-to-end workflow

### 2.1 Listing mini apps (portal)

```
ModuleGrid
  └─ useMiniApps()                       shell/src/lib/use-mini-apps.ts
       └─ fetchMiniApps()                shell/src/lib/modules-api.ts
            ├─ GET /api/manifests        → getSignedManifest()
            └─ verifyManifestSignature() shell/src/lib/manifest-signature.ts
                 ├─ import RSA public key (SPKI, RSASSA-PKCS1-v1_5 / SHA-256)
                 ├─ try each candidate payload serialization
                 └─ valid?  ── no ──▶ throw ▶ grid shows "Manifest Could Not Be Trusted"
                              └ yes ─▶ manifest returned ▶ NewMiniAppCard per app
```

**Nothing is rendered from an unverified manifest.** Set
`NEXT_PUBLIC_MANIFEST_SIGNATURE_REQUIRED=false` to downgrade the block to a
console warning (see §5).

### 2.2 Opening a mini app

```
/<miniAppId>?source=registry
  └─ MiniAppContainer (source="registry")
       ├─ useRegistryMiniApp(id)  → the app entry out of the *verified* manifest
       ├─ loadMiniAppSdk(id)      → unchanged SDK bootstrap
       └─ loader.loadBundle(id, bundleFetchUrl(bundleUrl), { bundleHash, version })
```

`bundleFetchUrl()` rewrites the archive URL to `/api/manifests/bundle?url=…`
because the storage origin sends no CORS headers (see §4).

### 2.3 Inside `loadBundle()` — the download → verify → unpack cycle

```
loadBundle(moduleId, url, { bundleHash, version })
│
├─ in-memory hit?  loadedModules[moduleId].bundleHash === bundleHash  ─▶ reuse, done
├─ concurrent open of the same digest? ─▶ share the in-flight promise
│
└─ loadBundlePlugin()
   │
   ├─ cachedHash = db.getBundleHash("<id>@bundle")
   │
   ├─ cachedHash === bundleHash ?
   │    YES ─▶ CACHE HIT — skip download, hash, and unzip entirely
   │    NO  ─▶ materializeBundle()
   │            1. fetch the .zip                     (60s abort timeout)
   │            2. db.putBinary("<id>@bundle", "__bundle.zip__", bytes)
   │            3. read it back out of IndexedDB      ← hashes what was *stored*
   │            4. verifyBundleHash(bytes, bundleHash)
   │                 mismatch ─▶ delete the zip, throw, keep the old cache intact
   │            5. unzip(bytes)                        → Map<path, Uint8Array>
   │            6. splitBundleEntries()                → { text, binary }
   │            7. db.storeBundle()  — wipes the namespace, writes every file,
   │                                   records __bundleHash__ + __version__,
   │                                   applies FIFO eviction
   │            8. finally: delete "__bundle.zip__"    ← the archive is never kept
   │
   ├─ readBundleFromCache()
   │    ├─ read manifest.json → bundle.entry / bundle.styles / bundle.files
   │    ├─ every other file  → Blob → blob: URL   (tracked for revocation)
   │    ├─ rewriteAssetReferences() on the entry JS and each stylesheet
   │    └─ returns { entryFileName, entryCode, styles }
   │
   ├─ evaluateModule()  — blob: URL + dynamic import (shared with the old flow)
   └─ mountWithIsolation() — Shadow DOM, styles injected inside the shadow root
```

On `unload()` the module's evaluation blob URL **and** all of its asset blob
URLs are revoked.

### 2.4 What ends up in IndexedDB

For `test-mini-app` (db `sewa-plugin-cache`, store `modules`):

```
test-mini-app@bundle/manifest.json           text
test-mini-app@bundle/mainCdHr8f6U.js         text   (entry)
test-mini-app@bundle/assets/main-*.css       text   (styles)
test-mini-app@bundle/favicon.svg             text
test-mini-app@bundle/icons.svg               text
test-mini-app@bundle/logo.png                binary { data: ArrayBuffer, binary: true, mimeType }
test-mini-app@bundle/__bundleHash__          text   ← the cache key
test-mini-app@bundle/__version__             text
__cache-order__                                     ← shared FIFO order
```

`test-mini-app@bundle/__bundle.zip__` exists **only** between steps 2 and 8 above.

---

## 3. Files

### New

| File | Role |
|---|---|
| `packages/runtime-loader/src/zip.ts` | ZIP reader built on `DecompressionStream("deflate-raw")` — no new dependency. STORED + DEFLATE, skips directory entries and `__MACOSX/`. `unzip()` :94 |
| `packages/runtime-loader/src/integrity.ts` | `verifyBundleHash()` :76 — parses `sha256-…` (also 384/512, hex or base64) and compares against the digest of the downloaded bytes |
| `packages/runtime-loader/src/bundle-assets.ts` | `splitBundleEntries()` :93 text/binary split, `mimeTypeFor()` :83, `rewriteAssetReferences()` :137 — points `"/icons.svg"`-style references at blob URLs |
| `packages/runtime-loader/src/bundle.load.test.ts` | 6 tests: zip round-trip (stored + deflated), zip dropped after extraction, digest mismatch caches nothing, matching digest skips the download, new digest re-downloads |
| `shell/src/lib/manifest-signature.ts` | `verifyManifestSignature()` — Web Crypto RSA verify; `isSignatureEnforced()`; the public key + its env override |
| `shell/src/lib/manifest-source.ts` | `getSignedManifest()` — fetches the live registry (`NEXT_PUBLIC_API_URL` + `/manifest-registry/registry/manifests/registry`) server-side. Shared by the list route and the bundle proxy so both judge the same document. |
| `shell/src/app/api/manifests/bundle/route.ts` | CORS proxy; refuses any URL the manifest does not list |

### Modified

| File | Change |
|---|---|
| `packages/host-platform/src/types/module.types.ts` | `SignedMiniAppManifest`; `ModuleManifest` fields absent from the real payload (`id`, `displayName`, `description`, `metaData`) made optional |
| `packages/runtime-loader/src/types.ts` | `ModuleSourceKind`, `BundleLoadOptions`, `CachedBinaryFile`, `BundleContents`; `LoadedModule.kind` / `.bundleHash` |
| `packages/runtime-loader/src/cache.ts` | `putText` :504, `putBinary` :531, `getBinary` :559, `deleteFile` :588, `storeBundle` :611, `getBundleHash` :483, `setBundleHash` :493; `getFile()` now returns `null` for binary records so they can't poison the in-memory string cache |
| `packages/runtime-loader/src/loader.ts` | `loadBundle()` :190 and its internals :591–:794; `unload()` :231 revokes asset URLs; `load()` :126 refuses to reuse a `kind: "bundle"` module |
| `packages/runtime-loader/src/index.ts` | exports the above |
| `shell/src/lib/modules-api.ts` | `fetchMiniApps()` verifies before returning; `findMiniApp()`; `bundleFetchUrl()` |
| `shell/src/lib/use-mini-apps.ts` | `useRegistryMiniApp()` — same query key as `useMiniApps`, so the signature check is shared |
| `shell/src/app/api/manifests/route.ts` | serves `getSignedManifest()` |
| `shell/src/app/[slug]/[[...segments]]/page.tsx` | reads `?source=`, wrapped in `<Suspense>` for `useSearchParams` |
| `shell/src/components/MiniAppContainer.tsx` | `MiniAppSource` prop, `MiniAppDescriptor` normalizing both flows, branches to `loadBundle()` when a `bundleHash` is present |
| `shell/src/components/NewMiniAppCard.tsx` | navigates with `?source=registry`; tolerates the missing `displayName` |
| `shell/src/components/ModuleGrid.tsx` | reads `manifest.miniApps`; distinct error state for a failed signature |
| `.env.example`, `.env` | the variables in §5 |

**Untouched:** `load()`, `downloadDirectory()`, `fetchViteManifest()`, the
fallback list, and every old route. The existing FIFO tests still pass.

---

## 4. Why the bundle proxy exists

R2's public bucket returns no `Access-Control-Allow-Origin`, so the browser
cannot fetch the archive directly:

```
Access to fetch at 'https://pub-….r2.dev/dist%206.zip' from origin
'http://localhost:3000' has been blocked by CORS policy
```

`/api/manifests/bundle?url=…` streams it through the shell's own origin. It is
**not** an open proxy — the URL must appear verbatim in the current manifest,
and `proxy.ts` already requires a session for `/api/*`. Integrity is unaffected:
the client hashes the bytes it receives, so a tampered proxy response fails the
same check a tampered download would.

The alternative is to allow `http://localhost:3000` (and your deployed origin)
in the bucket's CORS policy, then set `NEXT_PUBLIC_BUNDLE_PROXY=off`.

---

## 5. Configuration

| Variable | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_MANIFEST_PUBLIC_KEY` | key baked into `manifest-signature.ts` | PEM of the registry's signing key; `\n` escapes accepted |
| `NEXT_PUBLIC_MANIFEST_SIGNATURE_REQUIRED` | enforced | `false` renders an unverified manifest (still logged as an error) |
| `NEXT_PUBLIC_BUNDLE_PROXY` | on | `off` fetches the archive directly, once the bucket allows CORS |
| `NEXT_PUBLIC_MAX_CACHED_MINI_APPS` | 2 | FIFO limit, shared by both flows |

`NEXT_PUBLIC_*` values are inlined at build time — **restart the dev server**
after changing them.

---

## 6. Signature status — resolved

The registry's earlier sample signature could not verify: the published key and
the signature were from different key pairs (the signature was numerically
larger than the modulus, which is impossible for a genuine signature, and the
modulus was 2047 bits rather than 2048).

**The live registry has since been fixed.** Verified against
`GET /manifest-registry/registry/manifests/registry`:

- key is a proper 2048-bit RSA key, exponent 65537
- signature decodes as standard base64 (not base64url) — `decodeSignature()`
  handles both
- it verifies over the **third** candidate in `signedPayloadCandidates()`:
  `JSON.stringify(sortKeysDeep({ version, publishedAt, miniApps }))`

So the registry signs the payload fields only, with keys sorted. That candidate
is already first-class in the list; no code change was needed.

`.env` now correctly carries `NEXT_PUBLIC_MANIFEST_SIGNATURE_REQUIRED=true`.
Leave it that way — the bypass is no longer needed.

`bundleHash` was verified against the real archive and matches exactly.

---

## 7. Verification status

Covered by tests or run against the real artifacts:

- `unzip()` output is byte-identical to system `unzip` on the real
  `dist 6.zip`, for both stored and deflated entries
- `sha256(dist 6.zip)` matches the manifest's `bundleHash`
- a wrong digest leaves nothing in the cache
- a matching cached digest performs zero downloads
- a changed digest re-downloads
- the archive never survives extraction
- the legacy cache namespace is never written by the bundle flow
- FIFO eviction still behaves as before
- shell typechecks and `next build` succeeds

Not yet exercised: mounting the real mini app in a browser, and the bundle proxy
against the live R2 URL. Everything up to `evaluateModule` is covered; the
evaluation and mount steps are the same code the fallback flow already uses.

Run the tests with:

```bash
cd packages/runtime-loader && npx tsx --test src/bundle.load.test.ts src/cache.fifo.test.ts
```
