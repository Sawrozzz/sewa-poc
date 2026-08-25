/**
 * Module Registry & Runtime Loading contracts
 *
 * Manifest-Driven Plugin Runtime — mini apps are downloadable bundles loaded
 * in the same JS context as the shell. No Module Federation, no iframes.
 */

import type { DeviceExtraOptions } from "@lizuz/mini-app-types";
import type { PlatformEvent } from "../events";
import type {
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
  DownloadOptions,
  HttpResult,
  NavigationState,
  NavigationTarget,
  PlatformUser,
} from "./sdk-types";

/** The only loading strategy; shell downloads and evaluates the bundle on demand */
export type LoadStrategy = "plugin";

export type EntryType = "framework-agnostic";

export interface OldModuleManifest {
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
  /**
   * What the module may call through the SDK. An entry is a whole namespace
   * ("device", "http") or a single method inside one ("device.location").
   * Anything not listed is refused at the RPC boundary; `"*"` grants all.
   */
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
  mountMode?: "dom" | "shadow" | "portal";
  createdAt: string;
  updatedAt: string;
  dataCapabilities?: string[];
  miniAppCapabilities?: string[]
}

export interface ModuleCompatibility {
  minShellVersion: string;
  maxShellVersion?: string;
  minSdkVersion: string;
  supportedPlatforms: PlatformType[];
  supportedFrameworks: ("react" | "next" | "vue" | "angular" | "nuxt" | "solid" | "svelte")[];
}

export type PlatformType = "web" | "android" | "ios";

export type MetaDataType = {
  author: string;
  environment: string;
};
export interface ModuleManifest {
  /** Registry row id — absent from the signed manifest, which keys on miniAppId */
  id?: string;
  miniAppId: string;
  backingAgencyId?: string;
  displayName?: string;
  description?: string;
  category?: string;
  /** URL of the mini app's `.zip` bundle (the dist output of its build) */
  bundleUrl?: string;
  /** Digest of the archive at bundleUrl, e.g. "sha256-3193…" */
  bundleHash?: string;
  iconUrl?: string;
  bundleVerifiedAt?: Date | string;
  ingestionStatus?: string;
  ingestionError?: string | null;
  version?: string;
  sdkVersionRequired: string;
  loadStrategy?: string;
  status?: string;
  platform: PlatformType[];
  rolloutPercentage?: number;
  kycRequired: boolean;
  metaData?: MetaDataType;
  /**
   * What the mini app may call through the SDK. An entry is a whole namespace
   * ("device", "http") or a single method inside one ("device.location").
   * Anything not listed is refused at the RPC boundary; `"*"` grants all.
   */
  capabilities?: string[];
  dataCapabilities?: string[];
  miniAppCapabilities?: string[]
}

/**
 * The registry's signed mini-app manifest.
 *
 * The whole document is signed with the registry's private key; the shell
 * verifies `signature` against the published public key before it will show —
 * let alone load — any of the mini apps listed here.
 */
export interface SignedMiniAppManifest {
  /** Manifest revision, bumped on every publish */
  id: string;
  /** ISO timestamp of the publish */
  publishedAt: string;
  /** Mini apps this manifest vouches for */
  miniApps: ModuleManifest[];
  /** Signature algorithm (RS256 today) */
  algorithm: string;
  /** Identifier of the signing key, for rotation */
  keyId: string;
  /** base64url signature over the manifest payload */
  signature: string;
}

export interface MiniAppMeta {
  size: number;
  orderBy: string;
  sortBy: string;
  nextCursor: string;
  hasNext: boolean;
}

export interface MiniAppRecord {
  data: ModuleManifest[];
  meta: MiniAppMeta;
}

/** Result of loading a plugin bundle into the shell */
export interface RemoteLoadResult {
  moduleId: string;
  success: boolean;
  loadTimeMs: number;
  strategy: "plugin";
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
    location(options?: {
      highAccuracy?: boolean;
      timeout?: number;
      reason?: string;
    }): Promise<DevicePermissionResponse<DeviceLocationResult>>;
    camera(options?: {
      facing?: "front" | "back";
      reason?: string;
    }): Promise<DevicePermissionResponse<DeviceCameraResult>>;
    gallery(options?: {
      maxCount?: number;
      reason?: string;
    }): Promise<DevicePermissionResponse<DeviceGalleryResult>>;
    files(options?: {
      accept?: string[];
      multiple?: boolean;
    }): Promise<DevicePermissionResponse<DeviceFilesResult>>;
    download(options?: DownloadOptions): Promise<DevicePermissionResponse<DeviceDownloadResult>>;
    contact(options?: DeviceExtraOptions): Promise<DevicePermissionResponse<DeviceContactResult>>;
    biometric(options?: {
      reason?: string;
    }): Promise<DevicePermissionResponse<DeviceBiometricResult>>;
    notifications(options?: { requestPermission?: boolean }): Promise<DeviceNotificationResult>;
    network(): Promise<DeviceNetworkResult>;
    info(): Promise<DeviceInfoResult>;
  };
  http: {
    get<T = unknown>(endpoint?: string, query?: Record<string, string>): Promise<HttpResult<T>>;
    post<T = unknown>(
      endpoint?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<HttpResult<T>>;
    put<T = unknown>(
      endpoint?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<HttpResult<T>>;
    patch<T = unknown>(
      endpoint?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<HttpResult<T>>;
    delete<T = unknown>(
      endpoint?: string,
      headers?: Record<string, string>,
    ): Promise<HttpResult<T>>;
  };
  /** Internal event bus — plugins can subscribe to platform events */
  eventBus: {
    emit(
      type: string,
      source: string,
      payload: unknown,
      options?: { traceId?: string },
    ): Promise<boolean>;
    subscribe(type: string, handler: (event: PlatformEvent<unknown>) => void): () => void;
  };
}

/** A mini app bundle must export `mount` and optionally `unmount` */
export interface MiniAppBundle {
  mount: (container: HTMLElement, props?: Record<string, unknown>) => void;
  unmount: (container: HTMLElement) => void;
}
