export type {
  MessageType,
  PlatformError,
  PlatformMessage,
  HandshakePayload,
  HandshakeAckPayload,
  HostPlatformMessage,
  CreateMessageOptions,
} from './message.types';
export { createMessage } from './message-factory';
export { isPlatformMessage, splitEventType } from './message-validator';
