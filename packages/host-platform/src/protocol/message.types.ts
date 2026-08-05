/**
 * Message type definitions — mirror of
 * `mini-app-sdk/src/protocol/message.types.ts`.
 *
 * The canonical `PlatformMessage` and handshake payloads come from
 * `@lizuz/mini-app-types` — the single source of truth for the wire format.
 */

import type {
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

/** A `PlatformMessage` as handled by the host transport. */
export type HostPlatformMessage<T = unknown> = PlatformMessage<T>;

export interface CreateMessageOptions {
  id?: string;
  traceId?: string;
  version?: string;
  error?: PlatformError;
}
