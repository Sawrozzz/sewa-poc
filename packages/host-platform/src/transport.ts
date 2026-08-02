/**
 * Abstract Transport Layer
 *
 * Decouples host ↔ mini app communication from browser APIs.
 * - `PostMessageTransport`: cross-window `window.postMessage` (default —
 *   matches the SDK's `DefaultTransport` channel).
 * - `WindowEventTransport`: same-window CustomEvent dispatch.
 */

import type { HostPlatformMessage } from './protocol';
import { MESSAGE_CHANNEL } from './protocol';

export type MessageHandler = (
  message: HostPlatformMessage,
  source?: Window | null,
) => void;

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

export const SDK_CHANNEL_EVENT = 'gov-platform-sdk';

/**
 * Same-window transport using CustomEvent dispatch/addEventListener.
 * Used when mini apps run in the same JS context as the shell (no iframes).
 */
export class WindowEventTransport implements Transport {
  private handler: ((event: Event) => void) | null = null;

  send(message: HostPlatformMessage, _target?: Window | null): void {
    void _target;
    window.dispatchEvent(new CustomEvent(SDK_CHANNEL_EVENT, { detail: message }));
  }

  subscribe(handler: MessageHandler): () => void {
    this.handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.channel !== MESSAGE_CHANNEL) return;
      handler(detail as HostPlatformMessage, window);
    };
    window.addEventListener(SDK_CHANNEL_EVENT, this.handler);
    return () => {
      if (this.handler) {
        window.removeEventListener(SDK_CHANNEL_EVENT, this.handler);
        this.handler = null;
      }
    };
  }

  destroy(): void {
    this.handler = null;
  }
}

/**
 * Cross-window transport using window.postMessage / message event.
 * Used for iframe-based mini apps and WebView hosts — and the default for
 * the host, since it matches the SDK's own `DefaultTransport`.
 */
export class PostMessageTransport implements Transport {
  private handler: ((event: MessageEvent) => void) | null = null;

  send(message: HostPlatformMessage, target?: Window | null): void {
    (target ?? window.parent).postMessage(message, '*');
  }

  subscribe(handler: MessageHandler): () => void {
    this.handler = (event: MessageEvent) => {
      if (!event.data) {
        return;
      }
      const detail = event.data;
      if (!detail || detail.channel !== MESSAGE_CHANNEL) {
        return;
      }
      handler(detail as HostPlatformMessage, event.source instanceof Window ? event.source : null);
    };
    window.addEventListener('message', this.handler);
    return () => {
      if (this.handler) {
        window.removeEventListener('message', this.handler);
        this.handler = null;
      }
    };
  }

  destroy(): void {
    if (this.handler) {
      window.removeEventListener('message', this.handler);
      this.handler = null;
    }
  }
}
