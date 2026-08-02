/**
 * Shell-owned Event Bus.
 *
 * Mini Apps NEVER access this directly — all events flow through the
 * `RpcServer`. This is the host's governance layer for cross-boundary
 * events: schema validation, middleware, replay for late joiners, and
 * lightweight metrics.
 */

import { generateId } from '../utils';
import type { PlatformEvent } from './platform-event';
import type { EventSchema } from './platform-event';
import type { EventRegistryEntry } from './platform-event';
import { createPlatformEvent } from './platform-event';

export type EventHandler<T = unknown> = (event: PlatformEvent<T>) => void | Promise<void>;
export type EventMiddleware = (
  event: PlatformEvent,
  next: () => Promise<void>,
) => Promise<void>;

export interface EventBusMetrics {
  published: number;
  delivered: number;
  rejected: number;
  throughputPerSecond: number;
  activeSubscriptions: number;
  replayBufferSize: number;
}

export interface EventBusOptions {
  maxReplayBuffer?: number;
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
  private registry = new Map<string, EventRegistryEntry>();
  private subscriptions = new Map<string, Subscription[]>();
  private middleware: EventMiddleware[] = [];
  private replayBuffer: PlatformEvent[] = [];
  private metrics = { published: 0, delivered: 0, rejected: 0 };
  private throughputWindow: number[] = [];
  private readonly maxReplayBuffer: number;
  private readonly maxSubscriptionsPerType: number;
  private readonly enableTracing: boolean;
  private readonly onError?: (error: Error, event: PlatformEvent) => void;

  constructor(options: EventBusOptions = {}) {
    this.maxReplayBuffer = options.maxReplayBuffer ?? 500;
    this.maxSubscriptionsPerType = options.maxSubscriptionsPerType ?? 100;
    this.enableTracing = options.enableTracing ?? true;
    this.onError = options.onError;
    this.registerDefaultSchemas();
  }

  /** Register an event schema for validation and governance */
  registerSchema(schema: EventSchema): void {
    this.registry.set(schema.type, {
      ...schema,
      registeredAt: Date.now(),
    });
  }

  getRegistry(): ReadonlyMap<string, EventRegistryEntry> {
    return this.registry;
  }

  /** Add middleware to the event pipeline */
  use(middleware: EventMiddleware): () => void {
    this.middleware.push(middleware);
    return () => {
      const idx = this.middleware.indexOf(middleware);
      if (idx >= 0) this.middleware.splice(idx, 1);
    };
  }

  /** Publish an event to all matching subscribers */
  async publish<T>(event: PlatformEvent<T>): Promise<boolean> {
    if (!this.validateEvent(event)) {
      this.metrics.rejected++;
      return false;
    }

    this.metrics.published++;
    this.recordThroughput();
    this.addToReplayBuffer(event);

    if (this.enableTracing) {
      this.trace('publish', event);
    }

    const executeHandlers = async () => {
      const handlers = this.getMatchingHandlers(event.type, event.source);
      await Promise.allSettled(
        handlers.map(async (sub) => {
          try {
            await sub.handler(event);
            this.metrics.delivered++;
          } catch (err) {
            this.onError?.(err instanceof Error ? err : new Error(String(err)), event);
          }
        }),
      );
    };

    if (this.middleware.length === 0) {
      await executeHandlers();
    } else {
      let index = 0;
      const next = async (): Promise<void> => {
        if (index < this.middleware.length) {
          const mw = this.middleware[index++];
          await mw(event, next);
        } else {
          await executeHandlers();
        }
      };
      await next();
    }

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

  /** Replay buffered events to a new subscriber (for late joiners) */
  replay(type: string, handler: EventHandler, since?: number): void {
    const events = this.replayBuffer.filter(
      (e) => this.matchesType(e.type, type) && (!since || e.timestamp >= since),
    );
    for (const event of events) {
      Promise.resolve(handler(event)).catch((err: unknown) => {
        this.onError?.(err instanceof Error ? err : new Error(String(err)), event);
      });
    }
  }

  getMetrics(): EventBusMetrics {
    const now = Date.now();
    const recent = this.throughputWindow.filter((t) => now - t < 1000);
    return {
      ...this.metrics,
      throughputPerSecond: recent.length,
      activeSubscriptions: Array.from(this.subscriptions.values()).reduce(
        (sum, subs) => sum + subs.length,
        0,
      ),
      replayBufferSize: this.replayBuffer.length,
    };
  }

  /** Cleanup stale subscriptions and trim replay buffer */
  cleanup(maxAgeMs = 3600000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [type, subs] of this.subscriptions) {
      this.subscriptions.set(type, subs.filter((s) => s.createdAt > cutoff));
    }
    if (this.replayBuffer.length > this.maxReplayBuffer) {
      this.replayBuffer = this.replayBuffer.slice(-this.maxReplayBuffer);
    }
  }

  destroy(): void {
    this.subscriptions.clear();
    this.middleware = [];
    this.replayBuffer = [];
    this.registry.clear();
  }

  private validateEvent(event: PlatformEvent): boolean {
    if (!event.id || !event.type || !event.source || !event.version) return false;

    const schema = this.registry.get(event.type);
    if (schema) {
      if (schema.deprecated && this.enableTracing) {
        console.warn(
          `[EventBus] Deprecated event ${event.type} from ${event.source}. Migrate to: ${schema.migrateTo ?? 'N/A'}`,
        );
      }
      return schema.validate(event.payload);
    }

    return true;
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
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return eventType.startsWith(pattern.slice(0, -1));
    }
    return eventType === pattern;
  }

  private addToReplayBuffer(event: PlatformEvent): void {
    this.replayBuffer.push(event);
    if (this.replayBuffer.length > this.maxReplayBuffer) {
      this.replayBuffer.shift();
    }
  }

  private recordThroughput(): void {
    this.throughputWindow.push(Date.now());
    const cutoff = Date.now() - 5000;
    this.throughputWindow = this.throughputWindow.filter((t) => t > cutoff);
  }

  private trace(action: string, event: PlatformEvent): void {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.debug(`[EventBus:${action}] ${event.type} trace=${event.traceId} src=${event.source}`);
    }
  }

  private registerDefaultSchemas(): void {
    const passthrough = (payload: unknown): payload is unknown => {
      void payload;
      return true;
    };

    const schemas: EventSchema[] = [
      { type: 'navigation.route.request', version: '1.0.0', owner: 'shell', namespace: 'navigation', description: 'Navigation request from mini app', validate: passthrough },
      { type: 'navigation.route.changed', version: '1.0.0', owner: 'shell', namespace: 'navigation', description: 'Route changed in shell', validate: passthrough },
      { type: 'module.lifecycle.loaded', version: '1.0.0', owner: 'shell', namespace: 'module', description: 'Module loaded successfully', validate: passthrough },
      { type: 'module.lifecycle.failed', version: '1.0.0', owner: 'shell', namespace: 'module', description: 'Module load failed', validate: passthrough },
      { type: 'auth.session.changed', version: '1.0.0', owner: 'shell', namespace: 'auth', description: 'Auth state changed', validate: passthrough },
      { type: 'device.capability.request', version: '1.0.0', owner: 'shell', namespace: 'device', description: 'Device capability request', validate: passthrough },
    ];

    for (const schema of schemas) {
      this.registerSchema(schema);
    }
  }
}

export function createEventBus(options?: EventBusOptions): EventBus {
  return new EventBus(options);
}
