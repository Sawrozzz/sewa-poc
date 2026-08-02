/**
 * Cross-window transport using window.postMessage / message event.
 * Used for iframe-based mini apps and WebView hosts — and the default for
 * the host, since it matches the SDK's own `DefaultTransport`.
 */

import type { HostPlatformMessage } from '../protocol';
import { MESSAGE_CHANNEL } from '../constants';
import type { Transport, MessageHandler } from './transport';

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
