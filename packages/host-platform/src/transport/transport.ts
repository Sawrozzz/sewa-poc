/**
 * Abstract Transport Layer
 *
 * Decouples host ↔ mini app communication from browser APIs. All message
 * passing goes through this interface — Mini Apps and Shell must never
 * directly call window.postMessage or window.addEventListener.
 */

import type { HostPlatformMessage } from "../protocol";

export type MessageHandler = (message: HostPlatformMessage, source?: Window | null) => void;

/**
 * Transport abstraction — all message passing goes through this interface.
 * Mini apps and Shell must never directly call window.postMessage or
 * window.addEventListener.
 */
export interface Transport {
  send(message: HostPlatformMessage, target?: Window | null): void;
  subscribe(handler: MessageHandler): () => void;
  destroy(): void;
}
