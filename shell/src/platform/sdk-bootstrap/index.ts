/**
 * Host-side bootstrap for the Mini App SDK (`@lizuz/sewa-sdk` v1.x).
 *
 * Public barrel — imports via `@/platform/sdk-bootstrap`. Implementation is
 * split by concern:
 *  - `constants.ts`  — global keys, default sources, capabilities
 *  - `types.ts`      — option/result/environment types
 *  - `core.ts`       — DOM-free bootstrap logic (unit-tested)
 *  - `browser.ts`    — DOM adapters (`loadMiniAppSdk`, `destroyMiniAppSdk`)
 */
export { SDK_GLOBAL_KEY, HOST_DESCRIPTOR_GLOBAL_KEY, DEFAULT_SDK_SOURCES, DEFAULT_HOST_CAPABILITIES } from "./constants.ts";
export type { MiniAppSdkHostOptions, MiniAppSdkLoadResult, SdkBootstrapEnv } from "./types.ts";
export {
  readSdkInstance,
  seedSdkConfig,
  bootstrapMiniAppSdk,
  destroySdkInstance,
} from "./core.ts";
export { loadMiniAppSdk, destroyMiniAppSdk } from "./browser.ts";
