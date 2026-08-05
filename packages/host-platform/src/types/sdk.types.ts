/**
 * SDK surface contracts — implemented by Mini App SDK, fulfilled by the host.
 *
 * Types that are identical between the SDK and host are imported from
 * `@lizuz/mini-app-types`. Types that differ (shell-side services,
 * platform-specific shapes) are defined locally.
 */

import type {
  NavigationTarget,
  DevicePermissionStatus,
  FileModule,
  DeviceGalleryResult,
  HttpResult,
  HttpMethod,
  ApiResult,
} from '@lizuz/mini-app-types';

export type {
  NavigationTarget,
  FileModule,
  DeviceGalleryResult,
  HttpResult,
  HttpMethod,
  ApiResult,
};

export type {
  Direction,
  ThemePreference,
  ThemeMode,
  LocaleState,
  ThemeState,
  AppearanceState,
  AppearanceSdkModule,
} from '@lizuz/mini-app-types';

export interface PlatformUser {
  id: string;
  email: string;
  fullName: string;
  nationalId: string;
  permissions: string[];
  roles?: string[];
  metadata?: Record<string, unknown>;
}

export interface NavigationState {
  app: string;
  route: string;
  params: Record<string, string>;
  historyLength: number;
}

export type DevicePermissionResponse<T> = {
  status: DevicePermissionStatus;
  data?: T;
  error?: string;
};

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: string;
}

export interface DeviceCameraResult {
  url: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
}

export interface DeviceContactResult {
  contactName?: string;
  /**
   * Kept as a string: phone numbers carry leading zeros and a `+<country>`
   * prefix, both of which a JS number silently destroys.
   */
  number: string;
}

export interface FileOptions {
  reason?: string;
  multiple?: boolean;
  accept?: string[];
}

export interface DeviceFilesResult {
  files: FileModule[];
}

export interface DeviceDownloadResult {
  file: FileModule;
  /**
   * True when the file was written to a destination the user explicitly picked
   * (File System Access API), so the save is confirmed.
   *
   * False when the browser lacks that API and the file was handed to its own
   * download manager instead. The web platform exposes no completion or
   * cancellation signal for that path, so the outcome is unknown — the user may
   * still have dismissed the browser's own save dialog.
   */
  saved: boolean;
}

export interface DownloadOptions {
  url: string;
  fileName: string;
  mimeType?: string;
  reason?: string;
}

/**
 * Modality the unlock sheet was labelled as: `face` on iOS (Face ID),
 * `fingerprint` on Android, `biometric` anywhere else.
 *
 * Advisory, for matching your copy to the sheet the user sees — NOT a
 * guarantee of which sensor ran. The web cannot ask a device what hardware it
 * has, so an older Touch ID iPhone still reports `face`.
 */
export type BiometricMethod = 'face' | 'fingerprint' | 'biometric';

export interface DeviceBiometricResult {
  /** True only when the device's own biometric prompt verified the user. */
  success: boolean;
  /** Which prompt was shown. See {@link BiometricMethod}. */
  method?: BiometricMethod;
}

export interface DeviceNotificationResult {
  granted: boolean;
  token?: string;
}

export interface DeviceNetworkResult {
  online: boolean;
  type: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
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

export type PlatformTypeLiteral = 'WEB' | 'FLUTTER';

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

export interface ShellNavigationService {
  navigate(target: NavigationTarget): Promise<void>;
  getCurrent(): NavigationState;
  onNavigate(handler: (state: NavigationState) => void): () => void;
}
