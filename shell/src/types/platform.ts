import type { MiniAppSdkInterface } from '@lizuz/mini-app-types';
import type { PlatformUser } from '@sewa/host-platform';

export interface PlatformServicesConfig {
  getUser: () => PlatformUser | null;
  getAccessToken: () => string | null;
  logout: () => Promise<void>;
  navigate: (path: string) => void;
}

export interface LocalApiRequestParams {
  method?: string;
  endpoint?: string;
  path?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface LocalApiResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  error?: string;
}

export interface MiniAppSdkHostOptions {
  /** RPC request timeout, ms. Defaults to 30000. */
  timeout?: number;
  /** Handshake/request retry attempts. Defaults to 5. */
  retryAttempts?: number;
  /** Retry base delay, ms. Defaults to 500. */
  retryDelayMs?: number;
  /** Ceiling for exponential retry backoff, ms. Defaults to 10000. */
  maxRetryDelayMs?: number;
  /** Host shell release version advertised in the host descriptor. */
  hostVersion?: string;
  /** The SDK package version the bundle is expected to be. */
  sdkVersion?: string;
  /** Host capability strings advertised to mini apps. */
  capabilities?: readonly string[];
  /** Bundle source to load (overrides `DEFAULT_SDK_SOURCE`). */
  source?: string;
}

export interface MiniAppSdkLoadResult {
  sdk: MiniAppSdkInterface;
  /** Which source produced the instance ("existing" or a bundle URL). */
  source: string;
  /** Wall time of the `initialize()` handshake, in milliseconds. */
  initTimeMs: number;
}

/** Injectable environment so the core logic is testable without a DOM. */
export interface SdkBootstrapEnv {
  window: Window & typeof globalThis;
  loadScript: (source: string) => Promise<void>;
  now: () => number;
}
