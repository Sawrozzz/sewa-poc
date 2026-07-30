/**
 * Module Registry & Runtime Loading contracts
 *
 * Manifest-Driven Plugin Runtime — mini apps are downloadable bundles loaded
 * in the same JS context as the shell. No Module Federation, no iframes.
 */

import type {
  PlatformUser,
  NavigationTarget,
  NavigationState,
  ChatSdkModule,
  DevicePermissionResponse,
  DeviceLocationResult,
  DeviceCameraResult,
  DeviceGalleryResult,
  DeviceFilesResult,
  DeviceDownloadResult,
  DownloadOptions,
  DeviceBiometricResult,
  DeviceNotificationResult,
  DeviceNetworkResult,
  DeviceInfoResult,
  HttpResult,
} from './sdk';
import type { PlatformEvent } from './events';
import type { BridgeEnvelope } from './bridge';
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ComponentType<Props = {}> {
  (props: Props): unknown;
}

/** The only loading strategy; shell downloads and evalutes the bundle on demand */
export type LoadStrategy = 'plugin';

export type EntryType = 'framework-agnostic';

export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  vendor: string;
  version: string;
  /** SDK version required by the mini app (kept for backward compat) */
  sdkVersion: string;
  icon: string;
  color: string;
  category: string;
  route: string;
  requiredPermissions: string[];
  isEnabled: boolean;
  order: number;
  /** Features the module is allowed to use (e.g. "ai", "http", "event") */
  capabilities?: string[];
  /** Base URL where the bundle is served (CDN / origin). The loader fetches bundleUrl from here. */
  bundleUrl: string;
  /** What entry point the bundle exposes — used by the loader to resolve the component factory */
  entryType: EntryType;
  /** Loading strategy for manifest-driven runtime */
  loadStrategy: LoadStrategy;
  /** Compatibility matrix */
  compatibility: ModuleCompatibility;
  /** Subresource integrity hash for bundle verification */
  integrity?: string;
  /** How to mount the loaded plugin into the shell's DOM */
  mountMode?: 'dom' | 'shadow' | 'portal';
  createdAt: string;
  updatedAt: string;
}

export interface ModuleCompatibility {
  minShellVersion: string;
  maxShellVersion?: string;
  minSdkVersion: string;
  supportedPlatforms: PlatformType[];
  supportedFrameworks: ('react' | 'next' | 'vue' | 'angular')[];
}

export type PlatformType = 'WEB' | 'ANDROID' | 'IOS';

export interface ModuleRegistration {
  manifest: ModuleManifest;
  status: ModuleStatus;
  lastLoadedAt?: number;
  loadCount: number;
  failureCount: number;
  lastError?: string;
}

export type ModuleStatus =
  | 'registered'
  | 'loading'
  | 'loaded'
  | 'failed'
  | 'disabled'
  | 'incompatible';

/** Result of loading a plugin bundle into the shell */
export interface RemoteLoadResult {
  moduleId: string;
  success: boolean;
  loadTimeMs: number;
  strategy: 'plugin';
  bundle?: {
    mount: (container: HTMLElement, props?: Record<string, unknown>) => void;
    unmount: (container: HTMLElement) => void;
  };
  error?: string;
  version?: string;
}

export interface VersionNegotiationResult {
  compatible: boolean;
  negotiatedVersion: string;
  warnings: string[];
  blockers: string[];
}

export interface PluginLoadOptions {
  retryAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  /** When true, verify integrity hash after download */
  validateIntegrity?: boolean;
}

// ---------------------------------------------------------------------------
// Window Bridge — communication layer between Shell and plugin bundles
// ---------------------------------------------------------------------------

/** Message types the bridge uses in the same JS context */
export type BridgeMessage = BridgeEnvelope;

/** Request from plugin → shell */
export interface BridgeRequestMsg extends BridgeEnvelope {
  type: 'request';
}

/** Response from shell → plugin */
export interface BridgeResponseMsg extends BridgeEnvelope {
  type: 'response';
}

/** Stream chunk from shell → plugin (e.g. chat) */
export interface BridgeStreamMsg extends BridgeEnvelope {
  type: 'stream';
  streamIndex?: number;
  streamLast?: boolean;
}

/** Event broadcast to plugins */
export interface BridgeEventMsg extends BridgeEnvelope {
  type: 'event';
}

/** The Shell exposes these services to plugins. Plugins never touch browser APIs directly. */
export interface PluginServices {
  auth: {
    getUser(): Promise<PlatformUser | null>;
    isAuthenticated(): boolean;
    logout(): Promise<void>;
  };
  permissions: {
    has(permission: string): boolean;
    list(): string[];
  };
  flags: {
    isEnabled(flag: string, moduleId?: string): boolean;
    getAll(moduleId?: string): Record<string, boolean>;
  };
  config: {
    get<T = unknown>(key: string, moduleId?: string): T | undefined;
    getAll(moduleId?: string): Record<string, unknown>;
  };
  navigation: {
    navigate(target: NavigationTarget): Promise<void>;
    getCurrent(): NavigationState;
    onNavigate(handler: (state: NavigationState) => void): () => void;
  };
  chat: ChatSdkModule;
  /** Device capabilities — only accessible through the shell bridge */
  device: {
    location(options?: { highAccuracy?: boolean; timeout?: number ; reson?:string }): Promise<DevicePermissionResponse<DeviceLocationResult>>;
    camera(options?: { facing?: 'front' | 'back' ; reason?:string }): Promise<DevicePermissionResponse<DeviceCameraResult>>;
    gallery(options?: { maxCount?: number ; reason?:string  }): Promise<DevicePermissionResponse<DeviceGalleryResult>>;
    files(options?: { accept?: string[]; multiple?: boolean }): Promise<DevicePermissionResponse<DeviceFilesResult>>;
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
  };
  http: {
    get<T = unknown>(endpoint?: string, query?: Record<string, string>): Promise<HttpResult<T>>;
    post<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
    put<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
    patch<T = unknown>(endpoint?: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
    delete<T = unknown>(endpoint?: string, headers?: Record<string, string>): Promise<HttpResult<T>>;
  };
  /** Internal event bus — plugins can subscribe to platform events */
  eventBus: {
    emit(type: string, source: string, payload: unknown, options?: { traceId?: string }): Promise<boolean>;
    subscribe(type: string, handler: (event: PlatformEvent<unknown>) => void): () => void;
  };
}

/** A mini app bundle must export `mount` and optionally `unmount` */
export interface MiniAppBundle {
  mount: (container: HTMLElement, props?: Record<string, unknown>) => void;
  unmount: (container: HTMLElement) => void;
}

export const MINI_APP_SDK_VERSION = '1.0.0';
export const BRIDGE_VERSION = '1.0.0';
