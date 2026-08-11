/**
 * Shell-owned Event Bus.
 *
 * Mini Apps NEVER access this directly — all events flow through the
 * `RpcServer`. This is the host's pub/sub layer for cross-boundary events.
 */

import { generateId } from "../utils";
import type { PlatformEvent } from "./platform-event";
import { createPlatformEvent } from "./platform-event";

export type EventHandler<T = unknown> = (event: PlatformEvent<T>) => void | Promise<void>;

export interface EventBusOptions {
  maxSubscriptionsPerType?: number;
  enableTracing?: boolean;
  onError?: (error: Error, event: PlatformEvent) => void;
}

interface Subscription {
  id: string;
  type: string;
  handler: EventHandler;
  source?: string;
  createdAt: number;
}

export class EventBus {
  private subscriptions = new Map<string, Subscription[]>();
  private readonly maxSubscriptionsPerType: number;
  private readonly enableTracing: boolean;
  private readonly onError?: (error: Error, event: PlatformEvent) => void;

  constructor(options: EventBusOptions = {}) {
    this.maxSubscriptionsPerType = options.maxSubscriptionsPerType ?? 100;
    this.enableTracing = options.enableTracing ?? true;
    this.onError = options.onError;
  }

  /** Publish an event to all matching subscribers */
  async publish<T>(event: PlatformEvent<T>): Promise<boolean> {
    if (!event.id || !event.type || !event.source) return false;

    if (this.enableTracing) {
      this.trace("publish", event);
    }

    const handlers = this.getMatchingHandlers(event.type, event.source);
    await Promise.allSettled(
      handlers.map(async (sub) => {
        try {
          await sub.handler(event);
        } catch (err) {
          this.onError?.(err instanceof Error ? err : new Error(String(err)), event);
        }
      }),
    );

    return true;
  }

  /** Convenience publish with auto-generated envelope */
  emit<T>(
    type: string,
    source: string,
    payload: T,
    options?: { version?: string; traceId?: string },
  ): Promise<boolean> {
    return this.publish(createPlatformEvent(type, source, payload, options));
  }

  /** Subscribe to events by type pattern (supports wildcard suffix *) */
  subscribe(type: string, handler: EventHandler, source?: string): () => void {
    const subs = this.subscriptions.get(type) ?? [];

    if (subs.length >= this.maxSubscriptionsPerType) {
      throw new Error(`Max subscriptions (${this.maxSubscriptionsPerType}) reached for ${type}`);
    }

    const subscription: Subscription = {
      id: generateId(),
      type,
      handler,
      source,
      createdAt: Date.now(),
    };

    subs.push(subscription);
    this.subscriptions.set(type, subs);

    return () => this.unsubscribe(subscription.id, type);
  }

  unsubscribe(subscriptionId: string, type: string): void {
    const subs = this.subscriptions.get(type);
    if (!subs) return;
    this.subscriptions.set(
      type,
      subs.filter((s) => s.id !== subscriptionId),
    );
  }

  /** Cleanup stale subscriptions */
  cleanup(maxAgeMs = 3600000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [type, subs] of this.subscriptions) {
      this.subscriptions.set(
        type,
        subs.filter((s) => s.createdAt > cutoff),
      );
    }
  }

  destroy(): void {
    this.subscriptions.clear();
  }

  private getMatchingHandlers(type: string, source: string): Subscription[] {
    const handlers: Subscription[] = [];
    for (const [pattern, subs] of this.subscriptions) {
      if (this.matchesType(type, pattern)) {
        handlers.push(...subs.filter((s) => !s.source || s.source === source));
      }
    }
    return handlers;
  }

  private matchesType(eventType: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (pattern.endsWith("*")) {
      return eventType.startsWith(pattern.slice(0, -1));
    }
    return eventType === pattern;
  }

  private trace(action: string, event: PlatformEvent): void {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
      console.debug(
        `[EventBus:${action}] ${event.type} trace=${event.traceId} src=${event.source}`,
      );
    }
  }
}

export function createEventBus(options?: EventBusOptions): EventBus {
  return new EventBus(options);
}
