/**
 * Abstract Transport Layer
 *
 * Decouples SDK communication from browser APIs.
 * - WindowEventTransport: same-window CustomEvent (default for mini apps + shell in same context)
 * - PostMessageTransport: cross-window window.postMessage (for iframe/WebView mode)
 */

import type { PlatformMessage } from './communication';
import { MESSAGE_CHANNEL, isPlatformMessage } from './communication';

export type MessageHandler = (message: PlatformMessage, source?: Window | null) => void;

/**
 * Transport abstraction — all SDK message passing goes through this interface.
 * Mini apps and Shell must never directly call window.postMessage or window.addEventListener.
 */
export interface Transport {
  send(message: PlatformMessage, target?: Window | null): void;
  subscribe(handler: MessageHandler): () => void;
  destroy(): void;
}

export const SDK_CHANNEL_EVENT = 'gov-platform-sdk';

/**
 * Same-window transport using CustomEvent dispatch/addEventListener.
 * Used when mini apps run in the same JS context as the shell (no iframes).
 *
 * Both the Mini App SDK and ShellCommunicator use this transport by default.
 * The mini app dispatches a CustomEvent → the shell receives it via addEventListener.
 */
export class WindowEventTransport implements Transport {
  private handler: ((event: Event) => void) | null = null;

  send(message: PlatformMessage, _target?: Window | null): void {
    void _target;
    window.dispatchEvent(new CustomEvent(SDK_CHANNEL_EVENT, { detail: message }));
  }

  subscribe(handler: MessageHandler): () => void {
    this.handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.channel !== MESSAGE_CHANNEL) return;
      handler(detail as PlatformMessage, window);
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
 * Backward-compat alias for WindowEventTransport.
 */
export class WindowTransport implements Transport {
  private inner: WindowEventTransport;

  constructor() {
    this.inner = new WindowEventTransport();
  }

  send(message: PlatformMessage, target?: Window | null): void {
    this.inner.send(message, target);
  }

  subscribe(handler: MessageHandler): () => void {
    return this.inner.subscribe(handler);
  }

  destroy(): void {
    this.inner.destroy();
  }
}

/**
 * Cross-window transport using window.postMessage / message event.
 * Used for iframe-based mini apps and WebView hosts.
 */
export class PostMessageTransport implements Transport {
  private handler: ((event: MessageEvent) => void) | null = null;

  send(message: PlatformMessage, target?: Window | null): void {
    (target ?? window.parent).postMessage(message, '*');
  }

  subscribe(handler: MessageHandler): () => void {
    this.handler = (event: MessageEvent) => {
      if (!event.data || !isPlatformMessage(event.data)) {
        return;
      }
      handler(event.data as PlatformMessage, event.source instanceof Window ? event.source : null);
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

export function createTransport(type: 'window' | 'postmessage'): Transport {
  return type === 'window' ? new WindowTransport() : new PostMessageTransport();
}
