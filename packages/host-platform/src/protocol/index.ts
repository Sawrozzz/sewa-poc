export type {
  MessageType,
  PlatformError,
  PlatformMessage,
  HandshakePayload,
  HandshakeAckPayload,
  HostMessageType,
  HostPlatformMessage,
  CreateMessageOptions,
  StreamMessageFields,
} from './message.types';
export { createMessage } from './message-factory';
export { isPlatformMessage, isStreamMessage, splitEventType } from './message-validator';
