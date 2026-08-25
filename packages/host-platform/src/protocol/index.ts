export type {
  CreateMessageOptions,
  HandshakeAckPayload,
  HandshakePayload,
  HostMessageType,
  HostPlatformMessage,
  MessageType,
  PlatformError,
  PlatformMessage,
  StreamMessageFields,
} from "./message.types";
export { createMessage } from "./message-factory";
export {
  hasCompatibleMajorVersion,
  isPlatformMessage,
  isStreamMessage,
  majorVersionsMatch,
  splitEventType,
} from "./message-validator";
