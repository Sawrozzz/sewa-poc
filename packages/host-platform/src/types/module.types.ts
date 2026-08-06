/**
 * Module Registry & Runtime Loading contracts
 *
 * Manifest-Driven Plugin Runtime — mini apps are downloadable bundles loaded
 * in the same JS context as the shell. No Module Federation, no iframes.
 */

import type { PlatformEvent } from '../events';
import type {
  PlatformUser,
  NavigationTarget,
  NavigationState,
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
  DeviceContactResult,
} from './sdk.types';
import type { DeviceExtraOptions } from '@lizuz/mini-app-types';

/** The only loading strategy; shell downloads and evaluates the bundle on demand */
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
  supportedFrameworks: ('react' | 'next' | 'vue' | 'angular' | 'nuxt' | 'solid' | "svelte")[];
}

export type PlatformType = 'WEB' | 'ANDROID' | 'IOS';

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

export interface PluginLoadOptions {
  retryAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  /** When true, verify integrity hash after download */
  validateIntegrity?: boolean;
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
  /** Device capabilities — only accessible through the shell bridge */
  device: {
    location(options?: { highAccuracy?: boolean; timeout?: number; reason?: string }): Promise<DevicePermissionResponse<DeviceLocationResult>>;
    camera(options?: { facing?: 'front' | 'back'; reason?: string }): Promise<DevicePermissionResponse<DeviceCameraResult>>;
    gallery(options?: { maxCount?: number; reason?: string }): Promise<DevicePermissionResponse<DeviceGalleryResult>>;
    files(options?: { accept?: string[]; multiple?: boolean }): Promise<DevicePermissionResponse<DeviceFilesResult>>;
    download(options?: DownloadOptions): Promise<DevicePermissionResponse<DeviceDownloadResult>>;
    contact(options?: DeviceExtraOptions): Promise<DevicePermissionResponse<DeviceContactResult>>;
    biometric(options?: { reason?: string }): Promise<DevicePermissionResponse<DeviceBiometricResult>>;
    notifications(options?: { requestPermission?: boolean }): Promise<DeviceNotificationResult>;
    network(): Promise<DeviceNetworkResult>;
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
