/**
 * @sewa/host-platform — the Shell's privileged gateway.
 *
 * Consolidates the former `@sewa/platform-contracts`, `@sewa/event-bus`, and
 * `@sewa/shell-communicator` into one package, mirroring the Mini App SDK's
 * layering in reverse:
 *
 *   HostPlatform → RpcServer → Transport
 *                        ↕ shared protocol (from @lizuz/mini-app-types)
 *                    EventBus (host governance)
 */

// Wire protocol — re-exported from @lizuz/mini-app-types (single source).
export * from './protocol';

// Platform event contracts + host EventBus.
export * from './events';
export * from './event-bus';

// Contracts: SDK surface, module manifest, shell service map.
export * from './contracts';

// Transports.
export * from './transport';

// Server: MethodRegistry, RpcServer, HostPlatform.
export * from './server';
