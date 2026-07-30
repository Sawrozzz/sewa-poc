/**
 * SDK surface contracts — implemented by Mini App SDK, fulfilled by Shell Communicator
 *
 * Types that are identical between the SDK and host are imported from
 * `@sewa/mini-app-types`. Types that differ (shell-side services,
 * platform-specific shapes) are defined locally.
 */

import type {
  NavigationTarget,
  DevicePermissionStatus,
  FileModule,
  DeviceGalleryResult,
  StorageSdkModule,
  HttpResult,
  ApiSdkModule,
  HttpMethod,
  ApiResult,
} from '@lizuz/mini-app-types';

export type {
  NavigationTarget,
  FileModule,
  DeviceGalleryResult,
  StorageSdkModule,
  HttpResult,
  ApiSdkModule,
  HttpMethod,
  ApiResult,
};

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

export interface DeviceLocationOptionsModule {
  reason?:string
}

export interface DeviceCameraResult {
  url: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
}

export interface FileOptions {
  reason?:string;
  multiple?: boolean;
  accept?: string[]
}

export interface DeviceFilesResult {
  files: FileModule[]
}

export interface DeviceDownloadResult {
  file: FileModule
  /**
   * True when the file was written to a destination the user explicitly picked
   * (File System Access API), so the save is confirmed.
   *
   * False when the browser lacks that API and the file was handed to its own
   * download manager instead. The web platform exposes no completion or
   * cancellation signal for that path, so the outcome is unknown — the user may
   * still have dismissed the browser's own save dialog.
   */
  saved: boolean
}

export interface DownloadOptions {
  url: string;
  fileName: string;
  mimeType?: string;
  reason?: string;
}

export interface DeviceBiometricResult {
  success: boolean;
  method: 'fingerprint' | 'face' | 'pin';
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

export interface DeviceStorageResult {
  key: string;
  value: string | null;
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


/** Mini App service registration — allows apps to expose functions to other apps */
export interface ServiceRegistration {
  method: string;
  handler: (payload: unknown, context: { source: string; traceId: string }) => unknown | Promise<unknown>;
}

/** Public SDK interface exposed to mini app vendors */
export interface MiniAppSdkInterface {
  readonly miniAppId: string;
  readonly gsaProtocolVersion: string;
  readonly traceId: string;

  auth: AuthSdkModule;
  permissions: PermissionsSdkModule;
  flags: FlagsSdkModule;
  config: ConfigSdkModule;
  navigation: NavigationSdkModule;
  platform: PlatformSdkModule;
  device: DeviceSdkModule;
  api: ApiSdkModule;
  storage: StorageSdkModule;
  http: HttpSdkModule;
  chat: ChatSdkModule;

  initialize(): Promise<void>;
  destroy(): void;

  /** RPC — call another mini app's registered service */
  invoke(method: string, payload?: unknown): Promise<unknown>;
  /** RPC — register a service for other mini apps to call */
  register(method: string, handler: ServiceRegistration['handler']): void;

  /** Events — listen for platform or mini app events */
  on(event: string, handler: (payload: unknown) => void): () => void;
  /** Events — emit an event to subscribers */
  emit(event: string, payload?: unknown): void;
}

export interface AuthSdkModule {
  getUser(): Promise<PlatformUser | null>;
  isAuthenticated(): Promise<boolean>;
  logout(): Promise<void>;
}

export interface PermissionsSdkModule {
  has(permission: string): Promise<boolean>;
  list(): Promise<string[]>;
}

export interface FlagsSdkModule {
  isEnabled(flag: string): Promise<boolean>;
  getAll(): Promise<Record<string, boolean>>;
}

export interface ConfigSdkModule {
  get<T = unknown>(key: string): Promise<T | undefined>;
  getAll(): Promise<Record<string, unknown>>;
}

export interface NavigationSdkModule {
  navigate(target: NavigationTarget): Promise<void>;
  getCurrent(): Promise<NavigationState>;
}


export interface PlatformSdkModule {
  readonly type: PlatformTypeLiteral;
  isWeb(): boolean;
  isFlutter(): boolean;
  isMobile(): boolean;
}

export interface DeviceSdkModule {
  location(options?: { highAccuracy?: boolean; timeout?: number }): Promise<DevicePermissionResponse<DeviceLocationResult>>;
  camera(options?: { facing?: 'front' | 'back' }): Promise<DevicePermissionResponse<DeviceCameraResult>>;
  gallery(options?: FileOptions): Promise<DevicePermissionResponse<DeviceGalleryResult>>;
  files(options?: FileOptions): Promise<DevicePermissionResponse<DeviceFilesResult>>;
  download(options?: DownloadOptions): Promise<DevicePermissionResponse<DeviceDownloadResult>>;
  biometric(options?: { reason?: string }): Promise<DeviceBiometricResult>;
  notifications(options?: { requestPermission?: boolean }): Promise<DeviceNotificationResult>;
  network(): Promise<DeviceNetworkResult>;
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  info(): Promise<DeviceInfoResult>;
}

/** HTTP types — used by sdk.http.get() through the Shell HTTP proxy */
export interface HttpSdkModule {
  get<T = unknown>(endpoint?: string, query?: Record<string, string>): Promise<HttpResult<T>>;
  post<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  put<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  patch<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  delete<T = unknown>(endpoint?: string, headers?: Record<string, string>): Promise<HttpResult<T>>;
}

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

/** Shell-side service interfaces fulfilled by the communicator */
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


export interface ChatMessage {
  role: "user" | "system" | "ai";
  content: string;
}

export interface ModelCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface ChatSdkModule {
  chat(messages: ChatMessage[], options?: ModelCompletionOptions): AsyncIterable<string>;

}

export interface ShellServices {
  auth: ShellAuthService;
  permissions: ShellPermissionsService;
  chat: ChatSdkModule;
  flags: ShellFlagsService;
  config: ShellConfigService;
  navigation: ShellNavigationService;
}

