/**
 * Wire protocol shared between the Shell host and the Mini App SDK.
 *
 * The canonical envelope (`PlatformMessage`) and handshake payloads come
 * from `@lizuz/mini-app-types` — the single source of truth for the wire
 * format. `@lizuz/mini-app-types` is a types-only package (declarations,
 * no runtime JS), so the runtime constants are inlined here; keep them in
 * sync with `mini-app-types/src/constants.ts`. This module also adds
 * host-side helpers (`createMessage`, `isPlatformMessage`) and the host's
 * streaming extension (`stream` type), which the SDK validates out but
 * legacy chat streaming still emits.
 */

import type {
  MessageType,
  PlatformError,
  PlatformMessage,
} from '@lizuz/mini-app-types';

export type {
  MessageType,
  PlatformError,
  PlatformMessage,
  HandshakePayload,
  HandshakeAckPayload,
} from '@lizuz/mini-app-types';

/** Protocol version — mirrors `@lizuz/mini-app-types` (single source). */
export const PROTOCOL_VERSION = '1.0.0';
/** Message channel used for all platform traffic. */
export const MESSAGE_CHANNEL = 'gov-platform-sdk';
/** CustomEvent name the SDK dispatches on the window. */
export const PLATFORM_EVENT_NAME = 'gov-platform-event';
/** Target the shell uses when addressing the host. */
export const HOST_TARGET = 'shell';
/** Broadcast target — every connected mini app. */
export const BROADCAST_TARGET = '*';
/** Global key the host descriptor is published under. */
export const HOST_DESCRIPTOR_GLOBAL_KEY = '__GSA_HOST_DESCRIPTOR__';
/** Global key the SDK exposes itself under. */
export const SDK_GLOBAL_KEY = '__GSA_SDK__';

export const NAMESPACES = {
  AUTH: 'auth',
  PERMISSIONS: 'permissions',
  FLAGS: 'flags',
  CONFIG: 'config',
  NAVIGATION: 'navigation',
  PLATFORM: 'platform',
  DEVICE: 'device',
  API: 'api',
  STORAGE: 'storage',
  HTTP: 'http',
  EVENT: 'event',
  HANDSHAKE: 'handshake',
} as const;

export const SDK_CAPABILITIES: readonly string[] = [
  NAMESPACES.AUTH,
  NAMESPACES.PERMISSIONS,
  NAMESPACES.FLAGS,
  NAMESPACES.CONFIG,
  NAMESPACES.NAVIGATION,
  NAMESPACES.PLATFORM,
  NAMESPACES.DEVICE,
  NAMESPACES.STORAGE,
  NAMESPACES.API,
  NAMESPACES.HTTP,
];

export const ACTIONS = {
  AUTH: { GET_USER: 'getUser', IS_AUTHENTICATED: 'isAuthenticated', LOGOUT: 'logout' },
  PERMISSIONS: { HAS: 'has', LIST: 'list' },
  FLAGS: { IS_ENABLED: 'isEnabled', GET_ALL: 'getAll' },
  CONFIG: { GET: 'get', GET_ALL: 'getAll' },
  NAVIGATION: { NAVIGATE: 'navigate', GET_CURRENT: 'getCurrent' },
  PLATFORM: { GET_TYPE: 'getType' },
  DEVICE: {
    LOCATION: 'location', CAMERA: 'camera', GALLERY: 'gallery',
    FILES: 'files', BIOMETRIC: 'biometric', NOTIFICATIONS: 'notifications',
    NETWORK: 'network', INFO: 'info', CONTACT: 'contact',
  },
  HTTP: { GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'delete' },
  STORAGE: { GET: 'get', SET: 'set', REMOVE: 'remove' },
  API: { REQUEST: 'request' },
  EVENT: { SUBSCRIBE: 'subscribe', UNSUBSCRIBE: 'unsubscribe', EMIT: 'emit' },
  HANDSHAKE: { CONNECT: 'connect' },
} as const;

/** Host-side extension of the canonical 4-type protocol for chat streaming. */
export type HostMessageType = MessageType | 'stream';

export interface StreamMessageFields {
  streamIndex?: number;
  streamTotal?: number;
  streamLast?: boolean;
}

/** A `PlatformMessage` plus the host's streaming extension. */
export type HostPlatformMessage<T = unknown> = Omit<
  PlatformMessage<T>,
  'type'
> & {
  type: HostMessageType;
  streamIndex?: number;
  streamTotal?: number;
  streamLast?: boolean;
};

export interface CreateMessageOptions {
  id?: string;
  traceId?: string;
  version?: string;
  error?: PlatformError;
  streamIndex?: number;
  streamTotal?: number;
  streamLast?: boolean;
}

/**
 * Builds a `PlatformMessage` envelope with every required field populated.
 * The shape matches the SDK's own message factory exactly, so messages the
 * host sends are accepted by the SDK's validator.
 */
export function createMessage<T>(
  type: HostMessageType,
  namespace: string,
  action: string,
  source: string,
  target: string,
  payload?: T,
  options: CreateMessageOptions = {},
): HostPlatformMessage<T> {
  return {
    channel: MESSAGE_CHANNEL,
    requestId: options.id ?? generateId(),
    type,
    namespace,
    action,
    source,
    target,
    gsaProtocolVersion: options.version ?? PROTOCOL_VERSION,
    payload,
    error: options.error,
    traceId: options.traceId ?? generateId(),
    timestamp: Date.now(),
    streamIndex: options.streamIndex,
    streamTotal: options.streamTotal,
    streamLast: options.streamLast,
  };
}

/** Lightweight structural check for inbound platform traffic. */
export function isPlatformMessage(data: unknown): data is PlatformMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as PlatformMessage;
  return (
    msg.channel === MESSAGE_CHANNEL &&
    typeof msg.namespace === 'string' &&
    typeof msg.action === 'string' &&
    typeof msg.source === 'string' &&
    typeof msg.target === 'string' &&
    (msg.type === 'request' ||
      msg.type === 'response' ||
      msg.type === 'event' ||
      msg.type === 'handshake')
  );
}

export function isStreamMessage(
  data: unknown,
): data is HostPlatformMessage & { type: 'stream' } {
  if (!data || typeof data !== 'object') return false;
  const msg = data as HostPlatformMessage;
  return (
    msg.channel === MESSAGE_CHANNEL &&
    msg.type === 'stream' &&
    typeof msg.namespace === 'string' &&
    typeof msg.action === 'string'
  );
}

/**
 * Splits a full event type (`navigation.route.changed`) into the
 * `namespace` / `action` pair the SDK re-assembles as `namespace.action`
 * when routing `event` messages to subscribers. Splits on the FIRST dot so
 * multi-part actions survive intact.
 */
export function splitEventType(type: string): {
  namespace: string;
  action: string;
} {
  const idx = type.indexOf('.');
  if (idx === -1) return { namespace: type, action: '' };
  return { namespace: type.slice(0, idx), action: type.slice(idx + 1) };
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
