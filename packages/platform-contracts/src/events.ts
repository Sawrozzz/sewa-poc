/**
 * Platform Event Contract
 *
 * All cross-boundary events MUST conform to this schema.
 * Event naming: `<namespace>.<entity>.<action>` (e.g. `navigation.route.changed`)
 */

export interface PlatformEvent<T = unknown> {
  id: string;
  type: string;
  source: string;
  version: string;
  timestamp: number;
  traceId: string;
  payload: T;
}

export interface EventSchema {
  type: string;
  version: string;
  owner: string;
  namespace: string;
  description: string;
  deprecated?: boolean;
  deprecatedSince?: string;
  migrateTo?: string;
  validate: (payload: unknown) => payload is unknown;
}

export interface EventRegistryEntry extends EventSchema {
  registeredAt: number;
}

/** Canonical platform event namespaces */
export const EVENT_NAMESPACES = {
  AUTH: 'auth',
  AI: 'ai',
  NAVIGATION: 'navigation',
  MODULE: 'module',
  PERMISSION: 'permission',
  CONFIG: 'config',
  FLAG: 'flag',
  DEVICE: 'device',
  PLATFORM: 'platform',
} as const;

export type EventNamespace = (typeof EVENT_NAMESPACES)[keyof typeof EVENT_NAMESPACES];

/** Well-known platform event types */
export const PLATFORM_EVENTS = {
  NAVIGATION_REQUEST: 'navigation.route.request',
  NAVIGATION_CHANGED: 'navigation.route.changed',
  MODULE_LOADED: 'module.lifecycle.loaded',
  MODULE_FAILED: 'module.lifecycle.failed',
  MODULE_UNLOADED: 'module.lifecycle.unloaded',
  AUTH_STATE_CHANGED: 'auth.session.changed',
  AUTH_LOGOUT: 'auth.session.logout',
  PERMISSION_DENIED: 'permission.access.denied',
  CONFIG_UPDATED: 'config.runtime.updated',
  FLAG_UPDATED: 'flag.runtime.updated',
  DEVICE_REQUEST: 'device.capability.request',
  DEVICE_RESPONSE: 'device.capability.response',
} as const;

export interface NavigationRequestPayload {
  app: string;
  route: string;
  params?: Record<string, string>;
  replace?: boolean;
}

export interface NavigationChangedPayload {
  app: string;
  route: string;
  previousRoute?: string;
  params?: Record<string, string>;
}

export interface ModuleLifecyclePayload {
  moduleId: string;
  version: string;
  loadTimeMs?: number;
  error?: string;
}

export interface AuthStateChangedPayload {
  isAuthenticated: boolean;
  userId?: string;
}

export interface ConfigUpdatedPayload {
  key: string;
  value: unknown;
  scope: 'global' | 'module' | 'environment';
}

export interface FlagUpdatedPayload {
  key: string;
  enabled: boolean;
  moduleId?: string;
}

export interface DeviceRequestPayload {
  capability: DeviceCapability;
  options?: Record<string, unknown>;
}

export interface DeviceResponsePayload {
  capability: DeviceCapability;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type DeviceCapability =
  | 'location'
  | 'camera'
  | 'gallery'
  | 'files'
  | 'biometric'
  | 'notifications'
  | 'network'
  | 'storage'
  | 'info';


export function createPlatformEvent<T>(
  type: string,
  source: string,
  payload: T,
  options?: { version?: string; traceId?: string; id?: string }
): PlatformEvent<T> {
  return {
    id: options?.id ?? generateId(),
    type,
    source,
    version: options?.version ?? '1.0.0',
    timestamp: Date.now(),
    traceId: options?.traceId ?? generateId(),
    payload,
  };
}

export function parseEventType(type: string): { namespace: string; entity: string; action: string } {
  const parts = type.split('.');
  return {
    namespace: parts[0] ?? 'unknown',
    entity: parts[1] ?? 'unknown',
    action: parts.slice(2).join('.') || 'unknown',
  };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
