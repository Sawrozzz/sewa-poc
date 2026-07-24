/**
 * SDK surface contracts — implemented by Mini App SDK, fulfilled by Shell Communicator
 */

export interface PlatformUser {
  id: string;
  email: string;
  fullName: string;
  nationalId: string;
  permissions: string[];
  roles?: string[];
  metadata?: Record<string, unknown>;
}

export interface NavigationTarget {
  app: string;
  route: string;
  params?: Record<string, string>;
  replace?: boolean;
}

export interface NavigationState {
  app: string;
  route: string;
  params: Record<string, string>;
  historyLength: number;
}

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

export interface DeviceCameraResult {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface DeviceGalleryResult {
  files: Array<{ dataUrl: string; mimeType: string; name: string }>;
}

export interface DeviceFilesResult {
  files: Array<{ name: string; size: number; mimeType: string; content: string }>;
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

export type PlatformTypeLiteral = 'WEB' | 'ANDROID' | 'IOS';

export interface TelemetryContext {
  moduleId: string;
  traceId: string;
  sessionId: string;
}

/** Mini App service registration — allows apps to expose functions to other apps */
export interface ServiceRegistration {
  method: string;
  handler: (payload: unknown, context: { source: string; traceId: string }) => unknown | Promise<unknown>;
}

/** Public SDK interface exposed to mini app vendors */
export interface MiniAppSdkInterface {
  readonly moduleId: string;
  readonly version: string;
  readonly traceId: string;

  auth: AuthSdkModule;
  permissions: PermissionsSdkModule;
  flags: FlagsSdkModule;
  config: ConfigSdkModule;
  navigation: NavigationSdkModule;
  telemetry: TelemetrySdkModule;
  platform: PlatformSdkModule;
  device: DeviceSdkModule;
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

export interface TelemetrySdkModule {
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void;
  track(event: string, properties?: Record<string, unknown>): void;
  error(error: Error | string, context?: Record<string, unknown>): void;
}

export interface PlatformSdkModule {
  readonly type: PlatformTypeLiteral;
  isWeb(): boolean;
  isAndroid(): boolean;
  isIOS(): boolean;
  isMobile(): boolean;
}

export interface DeviceSdkModule {
  location(options?: { highAccuracy?: boolean; timeout?: number }): Promise<DeviceLocationResult>;
  camera(options?: { facing?: 'front' | 'back' }): Promise<DeviceCameraResult>;
  gallery(options?: { maxCount?: number }): Promise<DeviceGalleryResult>;
  files(options?: { accept?: string[]; multiple?: boolean }): Promise<DeviceFilesResult>;
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
export interface HttpResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface HttpSdkModule {
  get<T = unknown>(endpoint?: string, query?: Record<string, string>): Promise<HttpResult<T>>;
  post<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  put<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  patch<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  delete<T = unknown>(endpoint?: string, headers?: Record<string, string>): Promise<HttpResult<T>>;
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

export interface ShellTelemetryService {
  log(ctx: TelemetryContext, level: string, message: string, context?: Record<string, unknown>): void;
  track(ctx: TelemetryContext, event: string, properties?: Record<string, unknown>): void;
  error(ctx: TelemetryContext, err: Error | string, context?: Record<string, unknown>): void;
  getMetrics(): TelemetryMetrics;
}

export interface TelemetryMetrics {
  eventThroughput: number;
  navigationLatencyMs: number[];
  moduleLoadTimesMs: Record<string, number[]>;
  deviceInteractionCounts: Record<string, number>;
  errorCounts: Record<string, number>;
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
  telemetry: ShellTelemetryService;
}

