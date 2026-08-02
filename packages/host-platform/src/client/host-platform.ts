/**
 * HostPlatform — the host's composition root.
 *
 * Mirrors the Mini App SDK's `MiniAppSdk` layering in reverse:
 *
 *   HostPlatform (composition root)
 *     └── RpcServer (message pump, handshake, routing)
 *           └── Transport (dumb pipe)
 *
 * Owns the shared `EventBus`, exposes the `RpcServer`, and wires shell
 * services into the RPC method registry. The shell bootstraps the platform
 * by calling `createHostPlatform({ services, ... })` then `await platform.initialize()`.
 */

import { createEventBus, type EventBus, type EventBusOptions } from '../events';
import type { Transport } from '../transport';
import type { ShellServiceMap } from '../types';
import { RpcServer, createRpcServer } from '../rpc';

export interface HostPlatformOptions {
  services: ShellServiceMap;
  eventBus?: EventBus;
  eventBusOptions?: EventBusOptions;
  transport?: Transport;
  allowedOrigins?: string[];
  onModuleConnected?: (moduleId: string) => void;
  onModuleDisconnected?: (moduleId: string) => void;
}

export interface HostPlatformHandle {
  readonly eventBus: EventBus;
  readonly rpc: RpcServer;
  readonly transport: Transport;

  initialize(): Promise<void>;
  destroy(): void;
  disconnectModule(moduleId: string): void;
  getConnectedModules(): ReadonlyMap<string, unknown>;
  getModule(moduleId: string): unknown;
  registerMethod(
    method: string,
    handler: (payload: unknown, context: unknown) => unknown | Promise<unknown>,
  ): void;
}

export class HostPlatform implements HostPlatformHandle {
  readonly eventBus: EventBus;
  readonly rpc: RpcServer;
  readonly transport: Transport;

  private constructor(
    eventBus: EventBus,
    rpc: RpcServer,
    transport: Transport,
  ) {
    this.eventBus = eventBus;
    this.rpc = rpc;
    this.transport = transport;
  }

  static create(options: HostPlatformOptions): HostPlatform {
    const eventBus =
      options.eventBus ?? createEventBus(options.eventBusOptions);
    const rpc = createRpcServer({
      services: options.services,
      eventBus,
      transport: options.transport,
      allowedOrigins: options.allowedOrigins,
      onModuleConnected: options.onModuleConnected,
      onModuleDisconnected: options.onModuleDisconnected,
    });
    return new HostPlatform(eventBus, rpc, rpc.transport);
  }

  async initialize(): Promise<void> {
    await this.rpc.initialize();
  }

  destroy(): void {
    this.rpc.destroy();
    this.eventBus.destroy();
  }

  disconnectModule(moduleId: string): void {
    this.rpc.disconnectModule(moduleId);
  }

  getConnectedModules(): ReadonlyMap<string, unknown> {
    return this.rpc.getConnectedModules();
  }

  getModule(moduleId: string): unknown {
    return this.rpc.getModule(moduleId);
  }

  registerMethod(
    method: string,
    handler: (payload: unknown, context: unknown) => unknown | Promise<unknown>,
  ): void {
    this.rpc.registerMethod(method, handler);
  }
}

/**
 * Constructs a `HostPlatform`. Call `initialize()` to start the transport
 * and begin accepting mini app connections.
 */
export function createHostPlatform(options: HostPlatformOptions): HostPlatform {
  return HostPlatform.create(options);
}
