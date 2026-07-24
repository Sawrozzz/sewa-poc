/**
 * Window Bridge — communication layer between Shell and plugin bundles.
 *
 * All bridged calls use the same envelope regardless of transport
 * (in-process, postMessage for future iframe mode, etc.).
 */

export interface BridgeConfig {
  /** Unique id for this mini-app module */
  moduleId: string;
  /** SDK / bridge version the plugin declares */
  sdkVersion?: string;
  /** Methods the plugin expects the shell to support (e.g. "auth", "device", "http") */
  capabilities?: string[];
}

export interface BridgeRequestPayload<T = unknown> {
  namespace: string;
  action: string;
  payload?: T;
  traceId?: string;
  /** For chunked/streaming responses */
  streamIndex?: number;
  streamLast?: boolean;
}

/** All bridge messages carry a common metadata envelope */
export interface BridgeEnvelope<T = unknown> {
  bridge: 'gov-platform-bridge';
  id: string;
  type: BridgeMsgType;
  namespace: string;
  action: string;
  source: string;
  target: string;
  version: string;
  traceId: string;
  timestamp: number;
  payload?: T;
  error?: { code: string; message: string; retryable?: boolean };
  streamIndex?: number;
  streamLast?: boolean;
}

export type BridgeMsgType = 'request' | 'response' | 'event' | 'stream' | 'handshake';
