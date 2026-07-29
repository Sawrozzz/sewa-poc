/**
 * Shell ↔ Mini App communication protocol.
 *
 * Mini Apps communicate exclusively through postMessage envelopes.
 * The Mini App SDK serializes requests; the Shell Communicator deserializes and routes them.
 */

export const PROTOCOL_VERSION = "1.0.0";
export const MESSAGE_CHANNEL = "gov-platform-sdk";

export type MessageType = "request" | "response" | "event" | "handshake" |"stream";

export interface PlatformMessage<T = unknown> {
  channel: typeof MESSAGE_CHANNEL;
  requestId: string;
  type: MessageType;
  namespace: string;
  action: string;
  source: string;
  target: string;
  gsaProtocolVersion: string;
  traceId: string;
  timestamp: number;
  payload?: T;
  error?: PlatformError;
  streamIndex?: number;
  streamTotal?: number;
  streamLast?: boolean;
}

export interface PlatformError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export interface HandshakePayload {
  miniAppId: string;
  sdkVersion: string;
  capabilities: string[];
}

export interface HandshakeResponsePayload {
  shellVersion: string;
  communicatorVersion: string;
  negotiatedVersion: string;
  grantedCapabilities: string[];
  traceId: string;
}

/** SDK method identifiers — the only methods mini apps may invoke */
export const SDK_METHODS = {
  AUTH_GET_USER: "auth.getUser",
  AUTH_IS_AUTHENTICATED: "auth.isAuthenticated",
  AUTH_LOGOUT: "auth.logout",
  PERMISSIONS_HAS: "permissions.has",
  PERMISSIONS_LIST: "permissions.list",
  FLAGS_IS_ENABLED: "flags.isEnabled",
  FLAGS_GET_ALL: "flags.getAll",
  CONFIG_GET: "config.get",
  CONFIG_GET_ALL: "config.getAll",
  NAVIGATION_NAVIGATE: "navigation.navigate",
  NAVIGATION_GET_CURRENT: "navigation.getCurrent",
  TELEMETRY_LOG: "telemetry.log",
  TELEMETRY_TRACK: "telemetry.track",
  TELEMETRY_ERROR: "telemetry.error",
  PLATFORM_GET_TYPE: "platform.getType",
  PLATFORM_IS_WEB: "platform.isWeb",
  PLATFORM_IS_ANDROID: "platform.isAndroid",
  PLATFORM_IS_IOS: "platform.isIOS",
  PLATFORM_IS_MOBILE: "platform.isMobile",
  DEVICE_LOCATION: "device.location",
  DEVICE_CAMERA: "device.camera",
  DEVICE_GALLERY: "device.gallery",
  DEVICE_FILES: "device.files",
  DEVICE_BIOMETRIC: "device.biometric",
  DEVICE_NOTIFICATIONS: "device.notifications",
  DEVICE_NETWORK: "device.network",
  DEVICE_STORAGE: "device.storage",
  DEVICE_INFO: "device.info",
  STORAGE_GET: "storage.get",
  STORAGE_SET: "storage.set",
  STORAGE_REMOVE: "storage.remove",
  API_REQUEST: "api.request",
  EVENT_SUBSCRIBE: "event.subscribe",
  EVENT_UNSUBSCRIBE: "event.unsubscribe",
  EVENT_EMIT: "event.emit",
  INVOKE: "sdk.invoke",
  REGISTER: "sdk.register",
  HTTP_GET: "http.get",
  HTTP_POST: "http.post",
  HTTP_PUT: "http.put",
  HTTP_PATCH: "http.patch",
  HTTP_DELETE: "http.delete",
  AI_CHAT: "ai.chat",
} as const;

export type SdkMethod = (typeof SDK_METHODS)[keyof typeof SDK_METHODS];

export const SDK_CAPABILITIES = [
  "auth",
  "chat",
  "api",
  "permissions",
  "flags",
  "config",
  "navigation",
  "telemetry",
  "platform",
  "device",
  "storage",
  "http",
  "events",
] as const;

export type SdkCapability = (typeof SDK_CAPABILITIES)[number];

export const COMMUNICATOR_VERSION = "2.0.0";
export const SHELL_VERSION = "1.0.0";

export function createMessage<T>(
  type: MessageType,
  namespace: string,
  action: string,
  source: string,
  target: string,
  payload?: T,
  options?: {
    id?: string;
    traceId?: string;
    version?: string;
    error?: PlatformError;
    streamIndex?: number;
    streamTotal?: number;
    streamLast?: boolean;
  },
): PlatformMessage<T> {
  return {
    channel: MESSAGE_CHANNEL,
    requestId: options?.id ?? generateId(),
    type,
    namespace,
    action,
    source,
    target,
    gsaProtocolVersion: options?.version ?? PROTOCOL_VERSION,
    traceId: options?.traceId ?? generateId(),
    timestamp: Date.now(),
    payload,
    error: options?.error,
    streamIndex: options?.streamIndex,
    streamTotal: options?.streamTotal,
    streamLast: options?.streamLast,
  };
}

export function isPlatformMessage(data: unknown): data is PlatformMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as PlatformMessage;
  return (
    msg.channel === MESSAGE_CHANNEL &&
    typeof msg.namespace === "string" &&
    typeof msg.action === "string"
  );
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
