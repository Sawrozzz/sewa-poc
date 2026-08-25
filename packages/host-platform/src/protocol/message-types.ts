/**
 * Message type definitions — mirror of
 * `mini-app-sdk/src/protocol/message-types.ts`.
 *
 * The canonical `PlatformMessage` and handshake payloads come from
 * `@lizuz/mini-app-types` — the single source of truth for the wire format.
 * This module only adds the host's streaming extension (`stream` type),
 * which the SDK validates out but legacy chat streaming still emits.
 */

import type { MessageType, PlatformError, PlatformMessage } from "@lizuz/mini-app-types";

export type {
  HandshakeAckPayload,
  HandshakePayload,
  MessageType,
  PlatformError,
  PlatformMessage,
} from "@lizuz/mini-app-types";

/** Host-side extension of the canonical 4-type protocol for chat streaming. */
export type HostMessageType = MessageType | "stream";

export interface StreamMessageFields {
  streamIndex?: number;
  streamTotal?: number;
  streamLast?: boolean;
}

/** A `PlatformMessage` plus the host's streaming extension. */
export type HostPlatformMessage<T = unknown> = Omit<PlatformMessage<T>, "type"> & {
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
