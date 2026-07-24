/**
 * Browser Window Bridge — in-process bridge for Manifest-Driven Plugin Runtime.
 *
 * The shell installs this singleton on `window.__GOV_PLATFORM_BRIDGE__` once.
 * Plugin bundles retrieve their service proxy via:
 *   const services = window.__GOV_PLATFORM_BRIDGE__.getServices(moduleId)
 *
 * All calls are direct function invocations — zero serialization overhead.
 * No postMessage, no iframes, no transport layer.
 */
import type {
  PlatformUser,
  NavigationTarget,
  NavigationState,
  TelemetryMetrics,
  TelemetryContext,
  ChatMessage,
  DeviceLocationResult,
  DeviceCameraResult,
  DeviceGalleryResult,
  DeviceFilesResult,
  DeviceBiometricResult,
  DeviceNotificationResult,
  DeviceNetworkResult,
  DeviceInfoResult,
  HttpResult,
} from './sdk';

// ---------------------------------------------------------------------------
// Plugin-facing service interfaces
// ---------------------------------------------------------------------------

export interface BridgeAuthService {
  getUser(): Promise<PlatformUser | null>;
  isAuthenticated(): Promise<boolean>;
  logout(): Promise<void>;
}

export interface BridgePermissionsService {
  has(permission: string): boolean;
  list(): string[];
}

export interface BridgeFlagsService {
  isEnabled(flag: string, moduleId?: string): boolean;
  getAllFlags(moduleId?: string): Record<string, boolean>;
}

export interface BridgeConfigService {
  get<T = unknown>(key: string, moduleId?: string): T | undefined;
  getAll(moduleId?: string): Record<string, unknown>;
}

export interface BridgeNavigationService {
  navigate(target: NavigationTarget): Promise<void>;
  getCurrent(): NavigationState;
}

export interface BridgeTelemetryService {
  log(level: string, message: string, context?: Record<string, unknown>): void;
  track(event: string, properties?: Record<string, unknown>): void;
  error(err: Error | string, context?: Record<string, unknown>): void;
  getMetrics(): TelemetryMetrics;
}

export interface BridgeChatService {
  chat(messages: ChatMessage[], options?: Record<string, unknown>): AsyncIterable<string>;
}

export interface BridgeStorageService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface BridgeDeviceService {
  location(options?: { highAccuracy?: boolean; timeout?: number }): Promise<DeviceLocationResult>;
  camera(options?: { facing?: 'front' | 'back' }): Promise<DeviceCameraResult>;
  gallery(options?: { maxCount?: number }): Promise<DeviceGalleryResult>;
  files(options?: { accept?: string[]; multiple?: boolean }): Promise<DeviceFilesResult>;
  biometric(options?: { reason?: string }): Promise<DeviceBiometricResult>;
  notifications(options?: { requestPermission?: boolean }): Promise<DeviceNotificationResult>;
  network(): Promise<DeviceNetworkResult>;
  storage: BridgeStorageService;
  info(): Promise<DeviceInfoResult>;
}

export interface BridgeHttpService {
  get<T = unknown>(endpoint?: string, query?: Record<string, string>): Promise<HttpResult<T>>;
  post<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  put<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  patch<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  delete<T = unknown>(endpoint?: string, headers?: Record<string, string>): Promise<HttpResult<T>>;
}

/** The fully typed service object given to each plugin via getServices() */
export interface BridgeServices extends BridgeAuthService,
  BridgePermissionsService,
  BridgeFlagsService,
  BridgeConfigService,
  BridgeNavigationService,
  BridgeTelemetryService,
  BridgeChatService,
  BridgeDeviceService {
  http: BridgeHttpService;
}

// ---------------------------------------------------------------------------
// Shell-side service contracts (re-exported from sdk.ts to avoid duplication)
// ---------------------------------------------------------------------------

import type {
  ShellAuthService,
  ShellPermissionsService,
  ShellFlagsService,
  ShellConfigService,
  ShellNavigationService,
  ShellTelemetryService,
} from './sdk';

// Bridge-specific shell-side types (not exported from sdk.ts)
export interface ShellChatService {
  chat(messages: ChatMessage[], options?: Record<string, unknown>): AsyncIterable<string>;
}

export interface ShellDeviceService {
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

export interface ShellHttpService {
  get<T = unknown>(endpoint?: string, query?: Record<string, string>): Promise<HttpResult<T>>;
  post<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  put<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  patch<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  delete<T = unknown>(endpoint?: string, headers?: Record<string, string>): Promise<HttpResult<T>>;
}

export interface ShellServiceMap {
  auth: ShellAuthService;
  permissions: ShellPermissionsService;
  flags: ShellFlagsService;
  config: ShellConfigService;
  navigation: ShellNavigationService;
  telemetry: ShellTelemetryService;
  chat: ShellChatService;
  device: ShellDeviceService;
  http: ShellHttpService;
}

// ---------------------------------------------------------------------------
// BrowserFederationBridge — the singleton
// ---------------------------------------------------------------------------

export interface BrowserBridgeOptions {
  services: ShellServiceMap;
}

/**
 * Installed on window.__GOV_PLATFORM_BRIDGE__ by the shell.
 * Called by plugin bundles to get their scoped service proxy.
 */
export class BrowserFederationBridge {
  private services: ShellServiceMap | null = null;
  private moduleId: string | null = null;
  private initialized = false;
  private proxyCache = new Map<string, BridgeServices>();

  /**
   * Initialize the bridge with shell-side services.
   * Called by the platform once during bootstrap.
   */
  init(options: BrowserBridgeOptions): void {
    this.services = options.services;
    this.initialized = true;
  }

  /** Set the current plugin's module ID. */
  setModuleId(id: string): void {
    this.moduleId = id;
  }

  /**
   * Get the typed service proxy for a given module.
   * Returns null if the bridge is not initialized or module is unknown.
   */
  getServices(moduleId?: string): BridgeServices | null {
    if (!this.initialized || !this.services) return null;

    const ctx = moduleId ?? this.moduleId;
    if (!ctx) return null;

    // Memoize proxy per module ID
    if (this.proxyCache.has(ctx)) {
      return this.proxyCache.get(ctx)!;
    }

    const proxy = this.createProxy(ctx);
    this.proxyCache.set(ctx, proxy);
    return proxy;
  }

  /**
   * Create a proxy that delegates to the real shell services.
   * Zero serialization — direct function calls.
   */
  private createProxy(moduleId: string): BridgeServices {
    const svc = this.services!;

    return {
      // auth
      getUser: () => svc.auth.getUser(),
      isAuthenticated: () => svc.auth.isAuthenticated(),
      logout: () => svc.auth.logout(),
      // permissions
      has: (p) => svc.permissions.has(p),
      list: () => svc.permissions.list(),
      // flags
      isEnabled: (flag, mid) => svc.flags.isEnabled(flag, mid ?? moduleId),
      getAllFlags: (mid) => svc.flags.getAll(mid ?? moduleId),
      // config
      get: <T>(key: string, mid?: string) => svc.config.get<T>(key, mid ?? moduleId),
      getAll: (mid?: string) => svc.config.getAll(mid ?? moduleId),
      // navigation
      navigate: (t) => svc.navigation.navigate(t),
      getCurrent: () => svc.navigation.getCurrent(),
      // telemetry — passes module ID into context for tracing
      log: (level, msg, ctx) => {
        svc.telemetry.log({ moduleId, ...(ctx || {}) as Partial<TelemetryContext> } as TelemetryContext, level, msg);
      },
      track: (evt, props) => {
        svc.telemetry.track({ moduleId } as TelemetryContext, evt, props);
      },
      error: (err, ctx) => {
        svc.telemetry.error({ moduleId } as TelemetryContext, err, ctx);
      },
      getMetrics: () => svc.telemetry.getMetrics(),
      // chat
      chat: (messages, options) => svc.chat.chat(messages, options),
      // device
      location: (opts) => svc.device.location(opts),
      camera: (opts) => svc.device.camera(opts),
      gallery: (opts) => svc.device.gallery(opts),
      files: (opts) => svc.device.files(opts),
      biometric: (opts) => svc.device.biometric(opts),
      notifications: (opts) => svc.device.notifications(opts),
      network: () => svc.device.network(),
      storage: {
        get: (k) => svc.device.storage.get(k),
        set: (k, v) => svc.device.storage.set(k, v),
        remove: (k) => svc.device.storage.remove(k),
      },
      info: () => svc.device.info(),
      // http (nested — no conflict with flat methods)
      http: {
        get: (end, q) => svc.http.get(end, q),
        post: (end, body, h) => svc.http.post(end, body, h),
        put: (end, body, h) => svc.http.put(end, body, h),
        patch: (end, body, h) => svc.http.patch(end, body, h),
        delete: (end, h) => svc.http.delete(end, h),
      },
    };
  }

  /** Destroy the bridge and clear all caches. */
  destroy(): void {
    this.services = null;
    this.moduleId = null;
    this.initialized = false;
    this.proxyCache.clear();
  }
}
