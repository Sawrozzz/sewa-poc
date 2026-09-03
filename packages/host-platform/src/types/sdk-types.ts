/**
 * SDK surface contracts — implemented by Mini App SDK, fulfilled by the host.
 *
 * Canonical types are imported from `@lizuz/mini-app-types`. Host-only
 * extensions are defined as additive intersections so the wire format stays
 * compatible with the SDK's expectations.
 */

import type {
  ApiResult,
  ChatSdkModule,
  DeviceBiometricResult as BaseDeviceBiometricResult,
  DeviceDownloadResult as BaseDeviceDownloadResult,
  DeviceNetworkResult as BaseDeviceNetworkResult,
  DeviceContactResult as BaseDeviceContactResult,
  DeviceNotificationResult as BaseDeviceNotificationResult,
  DeviceInfoResult as BaseDeviceInfoResult,
  PlatformUser as BasePlatformUser,
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
  NavigationState as CanonicalNavigationState,
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

/**
 * Navigation state — canonical shape is { current, history } as per
 * `@lizuz/mini-app-types`. Host also carries shell-routing fields
 * (app/route/params/historyLength) for internal navigation; these are
 * optional on the wire so a mini app sees the canonical fields.
 */
export interface NavigationState extends CanonicalNavigationState {
  app?: string;
  route?: string;
  params?: Record<string, string>;
  historyLength?: number;
}

export type DevicePermissionResponse<T> = DevicePermissionBaseResponse<T>;

// Re-export canonical device results; host extensions are additive and optional.

export type DeviceContactResult = BaseDeviceContactResult;
// Alias kept for backwards compat — number remains optional per canonical type.
// Previously required here; now optional so TS matches SDK.

export type FileOptions = DeviceFileOptions;

export type DeviceFilesResult = DeviceFileResult;

export interface DeviceDownloadResult extends BaseDeviceDownloadResult {
  /**
   * True when the file was written to a destination the user explicitly picked
   * (File System Access API), so the save is confirmed.
   *
   * False when the browser lacks that API and the file was handed to its own
   * download manager instead.
   * Host-only, optional for wire compat — SDK will ignore if absent.
   */
  saved?: boolean;
}

export type DownloadOptions = DeviceDownloadOptions;

/**
 * Modality the unlock sheet was labelled as: `face` on iOS (Face ID),
 * `fingerprint` on Android, `biometric` anywhere else.
 */
export type BiometricMethod = "face" | "fingerprint" | "biometric";

export interface DeviceBiometricResult extends BaseDeviceBiometricResult {
  /** Which prompt was shown. See {@link BiometricMethod}. */
  method?: BiometricMethod;
}

/** Canonical DeviceNotificationResult uses `enabled`; host also accepts `granted` as alias for compat. */
export type DeviceNotificationResult = BaseDeviceNotificationResult & {
  /** @deprecated alias for `enabled` — host may return either */
  granted?: boolean;
};

/** Canonical DeviceNetworkResult has optional `type?: "wifi"|"cellular"|"none"`; host adds ethernet/unknown */
export type DeviceNetworkResult = Omit<BaseDeviceNetworkResult, "type"> & {
  type?: "wifi" | "cellular" | "none" | "ethernet" | "unknown";
};

/** Canonical DeviceInfoResult; host adds optional locale/timezone */
export interface DeviceInfoResult extends BaseDeviceInfoResult {
  locale?: string;
  timezone?: string;
}

/** Platform literal — use canonical lowercase "web" | "flutter"; uppercase kept as alias. */
export type PlatformTypeLiteral = "web" | "flutter" | "WEB" | "FLUTTER";

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
  set(key: string, value: string, options?: { ttlMs?: number }): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Shell-side service interfaces fulfilled by the host */
export interface ShellAuthService {
  getUser(): Promise<PlatformUser | null>;
  isAuthenticated(): Promise<boolean>;
  logout(): Promise<void>;
}

export interface ShellPermissionsService {
  has(permission: string): boolean | Promise<boolean>;
  list(): string[] | Promise<string[]>;
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
