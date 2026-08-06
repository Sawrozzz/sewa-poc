import { MESSAGE_CHANNEL } from '../constants';

import type {
  HostPlatformMessage,
  PlatformMessage,
} from './message.types';

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
