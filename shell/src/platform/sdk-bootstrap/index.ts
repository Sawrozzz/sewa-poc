export {
  SDK_GLOBAL_KEY,
  HOST_DESCRIPTOR_GLOBAL_KEY,
  DEFAULT_SDK_SOURCE,
  DEFAULT_HOST_CAPABILITIES,
} from "./constants";
export {
  readSdkInstance,
  seedSdkConfig,
  bootstrapMiniAppSdk,
  destroySdkInstance,
} from "./core";
export { loadMiniAppSdk, destroyMiniAppSdk } from "./browser";
