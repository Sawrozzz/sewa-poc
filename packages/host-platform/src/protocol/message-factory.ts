/**
 * Message factory — mirror of `mini-app-sdk/src/protocol/message-factory.ts`.
 *
 * Builds `PlatformMessage` envelopes with every required field populated.
 * The shape matches the SDK's own message factory exactly, so messages the
 * host sends are accepted by the SDK's validator.
 */

import { MESSAGE_CHANNEL, PROTOCOL_VERSION } from "../constants";
import { generateId } from "../utils";
import type { CreateMessageOptions, HostMessageType, HostPlatformMessage } from "./message-types";

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
