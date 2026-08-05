/**
 * Method Registry — maps each RPC method (`namespace.action`) to a handler.
 *
 * Handlers receive the raw payload plus an `RpcContext` carrying routing
 * metadata and a `send` escape hatch for out-of-band responses.
 */

import type { HostPlatformMessage } from '../protocol';

export interface RpcContext {
  /** The connected module that initiated the request. */
  moduleId: string;
  /** Correlation trace id, propagated from the request. */
  traceId: string;
  /** The originating request's correlation id. */
  requestId: string;
  /** The window the request came from (if any) — used for replies. */
  source?: Window | null;
  /** Low-level escape hatch for multi-message responses. */
  send(message: HostPlatformMessage, target?: Window | null): void;
}

export type RpcHandler<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
  context: RpcContext,
) => TResult | Promise<TResult>;

export class MethodRegistry {
  private methods = new Map<string, RpcHandler>();

  private key(namespace: string, action: string): string {
    return `${namespace}.${action}`;
  }

  /** Register a handler for `namespace.action`. */
  register(
    namespace: string,
    action: string,
    handler: RpcHandler,
  ): void {
    this.methods.set(this.key(namespace, action), handler);
  }

  /** Register a handler for a dotted `namespace.action` string. */
  registerMethod(method: string, handler: RpcHandler): void {
    const [namespace, ...rest] = method.split('.');
    const action = rest.join('.');
    if (!namespace || !action) {
      throw new Error(`Invalid method name: "${method}"`);
    }
    this.methods.set(this.key(namespace, action), handler);
  }

  /**
   * Invoke a method by `namespace.action`. Throws when the method is unknown.
   */
  async invoke<T = unknown>(
    namespace: string,
    action: string,
    payload: unknown,
    context: RpcContext,
  ): Promise<T> {
    const handler = this.methods.get(this.key(namespace, action));
    if (!handler) {
      throw new Error(`Unknown method: ${namespace}.${action}`);
    }
    return handler(payload, context) as Promise<T>;
  }
}
