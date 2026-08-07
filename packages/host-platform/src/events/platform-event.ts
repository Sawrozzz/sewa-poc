/**
 * Platform Event Contract
 *
 * All cross-boundary events MUST conform to this schema.
 * Event naming: `<namespace>.<entity>.<action>` (e.g. `navigation.route.changed`)
 */

import { generateId } from '../utils';

export interface PlatformEvent<T = unknown> {
  id: string;
  type: string;
  source: string;
  version: string;
  timestamp: number;
  traceId: string;
  payload: T;
}

/** Well-known platform event types */
export const PLATFORM_EVENTS = {
  NAVIGATION_REQUEST: 'navigation.route.request',
  NAVIGATION_CHANGED: 'navigation.route.changed',
  /**
   * shell -> mini app: the user pressed back and the shell is holding the
   * press. The mini app answers with `navigation.back` — `consumed: true`
   * means it popped one of its own routes and the shell must stay put.
   */
  NAVIGATION_BACK_REQUESTED: 'navigation.back.requested',
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
  LOCALE_CHANGED: 'appearance.locale.changed',
  THEME_CHANGED: 'appearance.theme.changed',
} as const;

export function createPlatformEvent<T>(
  type: string,
  source: string,
  payload: T,
  options?: { version?: string; traceId?: string; id?: string },
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
