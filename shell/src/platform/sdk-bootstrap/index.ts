export { SDK_GLOBAL_KEY, HOST_DESCRIPTOR_GLOBAL_KEY, DEFAULT_SDK_SOURCES, DEFAULT_HOST_CAPABILITIES } from "./constants.ts";
export type { MiniAppSdkHostOptions, MiniAppSdkLoadResult, SdkBootstrapEnv } from "./types.ts";
export {
  readSdkInstance,
  seedSdkConfig,
  bootstrapMiniAppSdk,
  destroySdkInstance,
} from "./core.ts";
export { loadMiniAppSdk, destroyMiniAppSdk } from "./browser.ts";
