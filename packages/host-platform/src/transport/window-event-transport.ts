/**
 * Same-window transport using CustomEvent dispatch/addEventListener.
 * Used when mini apps run in the same JS context as the shell (no iframes).
 */

import { MESSAGE_CHANNEL } from '../constants';

import { SDK_CHANNEL_EVENT } from './transport';

import type { HostPlatformMessage } from '../protocol';
import type { Transport, MessageHandler } from './transport';


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
