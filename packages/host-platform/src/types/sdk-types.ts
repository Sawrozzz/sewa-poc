/**
 * SDK surface contracts — implemented by Mini App SDK, fulfilled by the host.
 *
 * Types that are identical between the SDK and host are imported from
 * `@lizuz/mini-app-types`. Types that differ (shell-side services,
 * platform-specific shapes) are defined locally.
 */

import type {
  ApiResult,
  DeviceBiometricResult as BaseDeviceBiometricResult,
  DeviceDownloadResult as BaseDeviceDownloadResult,
  PlatformUser as BasePlatformUser,
  ChatSdkModule,
  DeviceDownloadOptions,
  DeviceFileOptions,
  DeviceFileResult,
  DeviceGalleryResult,
  DevicePermissionBaseResponse,
  FileModule,
  HttpMethod,
  HttpResult,
  HttpSdkModule,
  NavigationTarget,
} from "@lizuz/mini-app-types";

export type {
  AppearanceSdkModule,
  AppearanceState,
  DeviceCameraResult,
  DeviceLocationResult,
  Direction,
  LocaleState,
  ThemeMode,
  ThemePreference,
  ThemeState,
} from "@lizuz/mini-app-types";
export type {
  ApiResult,
  ChatSdkModule,
  DeviceGalleryResult,
  FileModule,
  HttpMethod,
  HttpResult,
  HttpSdkModule,
  NavigationTarget,
};

// Public user type is single-sourced from mini-app-types — host extends it with shell-only fields
export type PlatformUser = BasePlatformUser & {
  metadata?: Record<string, unknown>;
};

export interface NavigationState {
  app: string;
  route: string;
  params: Record<string, string>;
  historyLength: number;
}

export type DevicePermissionResponse<T> = DevicePermissionBaseResponse<T>;

// DeviceLocationResult / DeviceCameraResult are single-sourced from mini-app-types (re-exported above)

export interface DeviceContactResult {
  contactName?: string;
  /**
   * Kept as a string: phone numbers carry leading zeros and a `+<country>`
   * prefix, both of which a JS number silently destroys.
   * Divergence from mini-app-types: `number` is required here (web picker
   * always yields one), optional upstream for other platforms.
   */
  number: string;
}

export type FileOptions = DeviceFileOptions;

export type DeviceFilesResult = DeviceFileResult;

export interface DeviceDownloadResult extends BaseDeviceDownloadResult {
  /**
   * True when the file was written to a destination the user explicitly picked
   * (File System Access API), so the save is confirmed.
   *
   * False when the browser lacks that API and the file was handed to its own
   * download manager instead. The web platform exposes no completion or
   * cancellation signal for that path, so the outcome is unknown — the user may
   * still have dismissed the browser's own save dialog.
   * Divergence from mini-app-types: web-only confirmation flag.
   */
  saved: boolean;
}

export type DownloadOptions = DeviceDownloadOptions;

/**
 * Modality the unlock sheet was labelled as: `face` on iOS (Face ID),
 * `fingerprint` on Android, `biometric` anywhere else.
 *
 * Advisory, for matching your copy to the sheet the user sees — NOT a
 * guarantee of which sensor ran. The web cannot ask a device what hardware it
 * has, so an older Touch ID iPhone still reports `face`.
 */
export type BiometricMethod = "face" | "fingerprint" | "biometric";

export interface DeviceBiometricResult extends BaseDeviceBiometricResult {
  /** Which prompt was shown. See {@link BiometricMethod}. */
  method?: BiometricMethod;
}

export interface DeviceNotificationResult {
  granted: boolean;
  token?: string;
}

export interface DeviceNetworkResult {
  online: boolean;
  type: "wifi" | "cellular" | "ethernet" | "unknown";
  effectiveType?: string;
}

export interface DeviceInfoResult {
  platform: PlatformTypeLiteral;
  osVersion: string;
  appVersion: string;
  deviceModel: string;
  locale: string;
  timezone: string;
}

export type PlatformTypeLiteral = "WEB" | "FLUTTER";

export interface ApiRequestParams<TBody = unknown> {
  method: HttpMethod;
  path: string;
  body?: TBody;
  headers?: Record<string, string>;
}

export interface ShellApiService {
  request<T = unknown, B = unknown>(params: ApiRequestParams<B>): Promise<ApiResult<T>>;
}

export interface ShellStorageService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Shell-side service interfaces fulfilled by the host */
export interface ShellAuthService {
  getUser(): Promise<PlatformUser | null>;
  isAuthenticated(): Promise<boolean>;
  logout(): Promise<void>;
}

export interface ShellPermissionsService {
  has(permission: string): boolean;
  list(): string[];
}

export interface ShellFlagsService {
  isEnabled(flag: string, moduleId?: string): boolean;
  getAll(moduleId?: string): Record<string, boolean>;
  refresh(): Promise<void>;
}

export interface ShellConfigService {
  get<T = unknown>(key: string, moduleId?: string): T | undefined;
  getAll(moduleId?: string): Record<string, unknown>;
}

/** Reply to `navigation.back` / `navigation.push`. */
export interface NavigationRouterResult {
  /**
   * `true` = the mini app handled the step inside its own router, so the
   * shell must leave the container open. `false` = it has no history left
   * and the shell should take the press back.
   */
  consumed: boolean;
}

export interface ShellNavigationService {
  navigate(target: NavigationTarget): Promise<void>;
  getCurrent(): NavigationState;
  onNavigate(handler: (state: NavigationState) => void): () => void;

  /** A mini app answering `navigation.back.requested`. */
  back(consumed: boolean, moduleId: string): Promise<NavigationRouterResult>;
  /** A mini app reporting a forward step inside its own router. */
  push(consumed: boolean, moduleId: string): Promise<NavigationRouterResult>;

  // --- Host-only surface (never reachable from a mini app) ---

  /**
   * Publishes `navigation.back.requested` and resolves with the mini app's
   * answer. Resolves `false` immediately when no mini app has claimed any
   * history, and `false` on timeout, so the shell never hangs on a mini app
   * that doesn't implement the handshake.
   */
  requestBack(): Promise<boolean>;
  /**
   * True while a `requestBack()` call is still waiting on the mini app's
   * answer. The wire-level `navigation.router` RPC call carries only
   * `{ consumed }` — nothing marks it as a `back()` reply versus a `push()`
   * report — so the RPC server uses this to tell the two apart: a reply
   * arriving while a back press is held is the answer to it, anything else
   * is the mini app reporting its own forward step.
   */
  hasPendingBack(): boolean;
  /** Whether the mounted mini app currently has history of its own to pop. */
  canGoBack(): boolean;
  /** Records what the mini app last reported about its own history. */
  setCanGoBack(canGoBack: boolean): void;
  onCanGoBackChange(handler: (canGoBack: boolean) => void): () => void;
  /** Clears router state when a mini app unmounts. */
  resetRouter(): void;
}
