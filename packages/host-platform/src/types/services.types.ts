/**
 * Shell-side service contracts.
 *
 * These describe what the shell's concrete service implementations must
 * satisfy. The `RpcServer` routes mini app RPC calls to a `ShellServiceMap`
 * supplied by the shell. Deliberately separate from the SDK-facing module
 * shapes (`types/sdk.types.ts`) because the shell services are host-internal
 * and may expose extra surface (e.g. `refresh`, `onNavigate`).
 *
 * `http`/`api` are also implemented here as thin local wrappers; the RpcServer
 * additionally serves those namespaces itself via axios.
 */

import type {
  ApiSdkModule,
  AuthSdkModule,
  ConfigSdkModule,
  FlagsSdkModule,
  PermissionsSdkModule,
  StorageSdkModule,
} from "@lizuz/mini-app-types";
import type { ModuleManifest, OldModuleManifest } from "./module.types";
import type {
  ChatSdkModule,
  DeviceBiometricResult,
  DeviceCameraResult,
  DeviceContactResult,
  DeviceDownloadResult,
  DeviceFilesResult,
  DeviceGalleryResult,
  DeviceInfoResult,
  DeviceLocationResult,
  DeviceNetworkResult,
  DeviceNotificationResult,
  DevicePermissionResponse,
  FileOptions,
  HttpSdkModule,
  LocaleState,
  ShellNavigationService,
  ThemeState,
} from "./sdk.types";

type MiniAppManifest = ModuleManifest | OldModuleManifest;

/**
 * Shell-side host-driven appearance contract (locale, theme, tokens, host
 * catalogs). The shell implements this against its `AppearanceController`;
 * the `RpcServer` serves it to mini apps as the `appearance.*` namespace.
 * Mini-app catalogs (`app.<moduleId>.*`) are deliberately absent — they live
 * inside each mini app's own bundle and never reach the host.
 */
export interface ShellAppearanceService {
  getLocale(): Promise<LocaleState>;
  getTheme(): Promise<ThemeState>;
}

export interface ShellDeviceService {
  location(options?: {
    highAccuracy?: boolean;
    timeout?: number;
    reason?: string;
  }): Promise<DevicePermissionResponse<DeviceLocationResult>>;
  camera(options?: {
    facing?: "front" | "back";
    reason?: string;
  }): Promise<DevicePermissionResponse<DeviceCameraResult>>;
  gallery(options?: FileOptions): Promise<DevicePermissionResponse<DeviceGalleryResult>>;
  files(options?: FileOptions): Promise<DevicePermissionResponse<DeviceFilesResult>>;
  download(options?: { reason?: string }): Promise<DevicePermissionResponse<DeviceDownloadResult>>;
  contact(options?: { reason?: string }): Promise<DevicePermissionResponse<DeviceContactResult>>;
  biometric(options?: {
    reason?: string;
  }): Promise<DevicePermissionResponse<DeviceBiometricResult>>;
  notifications(options?: {
    requestPermission?: boolean;
    reason?: string;
  }): Promise<DeviceNotificationResult>;
  network(): Promise<DeviceNetworkResult>;
  info(): Promise<DeviceInfoResult>;
}
export interface ShellModuleManifestService {
  get(moduleId: string): MiniAppManifest | undefined;
  getAll(): Map<string, MiniAppManifest>;
}

export interface ShellServiceMap {
  auth: AuthSdkModule;
  permissions: PermissionsSdkModule;
  flags: FlagsSdkModule;
  config: ConfigSdkModule;
  navigation: ShellNavigationService;
  chat: ChatSdkModule;
  device: ShellDeviceService;
  storage: StorageSdkModule;
  api: ApiSdkModule;
  http: HttpSdkModule;
  appearance: ShellAppearanceService;
  moduleManifest: ShellModuleManifestService;
}
