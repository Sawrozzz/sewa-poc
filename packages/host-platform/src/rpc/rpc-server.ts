/**
 * RpcServer — the privileged gateway between Mini Apps and Shell internals.
 *
 * Replaces the old `ShellCommunicator` giant `switch` with a `MethodRegistry`.
 * Owns the transport subscription, handshake/version negotiation, connected
 * module lifecycle, capability gating, event subscription broadcast, and
 * `sdk.invoke` forwarding.
 *
 * Mini Apps NEVER bypass this layer. All SDK calls are validated, traced,
 * and routed here.
 */

import type { HostPlatformMessage } from '../protocol';
import { splitEventType, createMessage } from '../protocol';
import {
  PROTOCOL_VERSION,
  MESSAGE_CHANNEL,
  SDK_CAPABILITIES,
  ACTIONS,
  NAMESPACES,
} from '../constants';
import type { PlatformEvent } from '../events';
import { PLATFORM_EVENTS } from '../events';
import type { Transport } from '../transport';
import { WindowEventTransport } from '../transport';
import type { EventBus } from '../events';
import type { ShellServiceMap } from '../types';
import type { NavigationTarget } from '../types/sdk.types';
import { MethodRegistry, type RpcContext } from './method-registry';
import { RpcMethodError } from '../errors';
import axios from 'axios';

export interface RpcServerOptions {
  services: ShellServiceMap;
  eventBus: EventBus;
  transport?: Transport;
  allowedOrigins?: string[];
  onModuleConnected?: (moduleId: string) => void;
  onModuleDisconnected?: (moduleId: string) => void;
}

export interface ConnectedModule {
  moduleId: string;
  sdkVersion: string;
  protocolVersion: string;
  negotiatedVersion: string;
  capabilities: string[];
  connectedAt: number;
  origin: string;
  eventSubscriptions: Set<string>;
}

interface ServiceEntry {
  moduleId: string;
  method: string;
}

interface PendingRequest {
  resolve: (msg: HostPlatformMessage) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Capabilities the host actually serves, beyond the SDK's built-in set. */
// TEMP — Flutter parity test. Dropping 'appearance' makes `isMethodAllowed()`
// reject `appearance.*` requests, so this host looks exactly like the mobile
// shell to a mini app: locale/theme can only arrive via the `platform.getType`
// hint. The `appearance.*` EVENTS are unaffected — broadcastToModules() gates
// on eventSubscriptions, not capabilities — which is correct, since runtime
// changes must keep working on both shells.
// To restore: put 'appearance' back in the array.
const HOST_EXTRA_CAPABILITIES = ['event', 'ai', 'sdk'];export class RpcServer {
  private services: ShellServiceMap;
  private eventBus: EventBus;
  /** The transport bound to this server — also exposed for host observability. */
  readonly transport: Transport;
  private allowedOrigins: string[];
  private modules = new Map<string, ConnectedModule>();
  private pendingRequests = new Map<string, PendingRequest>();
  private transportUnsub: (() => void) | null = null;
  private eventUnsubscribers: Array<() => void> = [];
  private onModuleConnected?: (moduleId: string) => void;
  private onModuleDisconnected?: (moduleId: string) => void;
  private serviceRegistry = new Map<string, ServiceEntry>();
  private registry = new MethodRegistry({
    onUnknownMethod: (namespace, action) => {
      void namespace;
      void action;
    },
  });
  private _initialized = false;

  constructor(options: RpcServerOptions) {
    this.services = options.services;
    this.eventBus = options.eventBus;
    this.transport = options.transport ?? new WindowEventTransport();
    this.allowedOrigins = options.allowedOrigins ?? ['*'];
    this.onModuleConnected = options.onModuleConnected;
    this.onModuleDisconnected = options.onModuleDisconnected;
    this.registerMethods();
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;

    this.transportUnsub = this.transport.subscribe((msg, source) =>
      this.handleMessage(msg, source),
    );

    // Bridge the Event Bus to subscribed modules. Any event published by the
    // shell (navigation changes, module lifecycle, ...) or emitted by another
    // mini app is forwarded to modules that subscribed to its type.
    const unsub = this.eventBus.subscribe('*', (evt) => {
      this.broadcastToModules(evt);
    });
    this.eventUnsubscribers.push(unsub);
  }

  destroy(): void {
    this.transportUnsub?.();
    this.transport.destroy();
    for (const unsub of this.eventUnsubscribers) unsub();
    this.eventUnsubscribers = [];
    this.modules.clear();
    this.pendingRequests.clear();
    this.serviceRegistry.clear();
    this._initialized = false;
  }

  disconnectModule(moduleId: string): void {
    this.modules.delete(moduleId);
    for (const [method, entry] of this.serviceRegistry) {
      if (entry.moduleId === moduleId) {
        this.serviceRegistry.delete(method);
      }
    }
    this.onModuleDisconnected?.(moduleId);
  }

  getConnectedModules(): ReadonlyMap<string, ConnectedModule> {
    return this.modules;
  }

  getModule(moduleId: string): ConnectedModule | undefined {
    return this.modules.get(moduleId);
  }

  /** Register a one-off RPC method at runtime (e.g. from a custom host module). */
  registerMethod(method: string, handler: (payload: unknown, context: RpcContext) => unknown | Promise<unknown>): void {
    this.registry.registerMethod(method, handler);
  }

  private async handleMessage(
    msg: HostPlatformMessage,
    source?: Window | null,
  ): Promise<void> {
    if (!msg || msg.channel !== MESSAGE_CHANNEL) {
      return;
    }
    if (msg.type !== 'request' && msg.type !== 'handshake' && msg.type !== 'response') {
      return;
    }

    const origin = source === window || !source ? window.location.origin : '*';
    if (!this.isOriginAllowed(origin)) {
      return;
    }

    try {
      if (msg.type === 'handshake') {
        const response = await this.processHandshake(msg, origin);
        this.transport.send(response, source);
        return;
      }

      if (msg.type === 'request') {
        const response = await this.routeRequest(msg, source);
        this.transport.send(response, source);
        return;
      }

      // Response from a forwarded request (sdk.invoke) — resolve the pending.
      if (msg.type === 'response') {
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.requestId);
          pending.resolve(msg);
        }
        return;
      }
    } catch (err) {
      const error = {
        code: 'COMMUNICATOR_ERROR',
        message: err instanceof Error ? err.message : String(err),
      };
      this.transport.send(
        createMessage(
          'response',
          msg.namespace,
          msg.action,
          'shell',
          msg.source,
          undefined,
          {
            id: msg.requestId,
            traceId: msg.traceId,
            error,
          },
        ),
        source,
      );
    }
  }

  private async processHandshake(
    msg: HostPlatformMessage,
    origin: string,
  ): Promise<HostPlatformMessage> {
    const payload = (msg.payload ?? {}) as {
      miniAppId?: string;
      sdkVersion?: string;
      protocolVersion?: string;
      capabilities?: string[];
    };

    const miniAppId = payload.miniAppId ?? msg.source;
    const negotiatedVersion = this.negotiateVersion(payload.protocolVersion ?? payload.sdkVersion ?? PROTOCOL_VERSION);
    // `appearance` appears in both SDK_CAPABILITIES and HOST_EXTRA_CAPABILITIES;
    // dedupe so the negotiated list stays clean.
    const capabilities = Array.from(new Set([...SDK_CAPABILITIES, ...HOST_EXTRA_CAPABILITIES]));

    const module: ConnectedModule = {
      moduleId: miniAppId,
      sdkVersion: payload.sdkVersion ?? '0.0.0',
      protocolVersion: payload.protocolVersion ?? PROTOCOL_VERSION,
      negotiatedVersion,
      capabilities,
      connectedAt: Date.now(),
      origin,
      eventSubscriptions: new Set(),
    };

    this.modules.set(miniAppId, module);
    this.onModuleConnected?.(miniAppId);

    // HandshakeAckPayload — the exact shape the SDK's RpcClient reads:
    // { status, protocolVersion, capabilities }. No `grantedCapabilities`
    // (that field was never read by the SDK and silently broke negotiation).
    return createMessage(
      'response',
      NAMESPACES.HANDSHAKE,
      msg.action,
      'shell',
      miniAppId,
      {
        status: 'ok',
        protocolVersion: PROTOCOL_VERSION,
        capabilities,
      },
      {
        id: msg.requestId,
        traceId: msg.traceId,
      },
    );
  }

  private async routeRequest(
    msg: HostPlatformMessage,
    source?: Window | null,
  ): Promise<HostPlatformMessage> {
    const module = this.modules.get(msg.source);

    if (!module) {
      return this.errorResponse(
        msg,
        'MODULE_NOT_CONNECTED',
        'Module not connected. Call initialize() first.',
      );
    }

    if (!this.isMethodAllowed(msg.namespace, module)) {
      await this.eventBus.emit(
        PLATFORM_EVENTS.PERMISSION_DENIED,
        'shell',
        {
          moduleId: msg.source,
          method: `${msg.namespace}.${msg.action}`,
        },
        { traceId: msg.traceId },
      );
      return this.errorResponse(
        msg,
        'PERMISSION_DENIED',
        `${msg.namespace}.${msg.action} not allowed`,
      );
    }

    const context: RpcContext = {
      moduleId: msg.source,
      traceId: msg.traceId,
      requestId: msg.requestId,
      source,
      send: (message, target) => this.transport.send(message, target),
    };

    try {
      const result = await this.registry.invoke(
        msg.namespace,
        msg.action,
        msg.payload,
        context,
      );
      return this.okResponse(msg, result);
    } catch (err) {
      const code =
        err instanceof RpcMethodError
          ? err.code
          : 'HOST_ERROR';
      const message =
        err instanceof Error ? err.message : String(err);
      return this.errorResponse(msg, code, message, false);
    }
  }

  // ---------------------------------------------------------------------------
  // Default method handlers
  // ---------------------------------------------------------------------------

  private registerMethods(): void {
    const r = this.registry;

    r.register(NAMESPACES.AUTH, ACTIONS.AUTH.GET_USER, async () => this.services.auth.getUser());
    r.register(NAMESPACES.AUTH, ACTIONS.AUTH.IS_AUTHENTICATED, async () => this.services.auth.isAuthenticated());
    r.register(NAMESPACES.AUTH, ACTIONS.AUTH.LOGOUT, async (_, ctx) => {
      await this.services.auth.logout();
      await this.eventBus.emit(
        PLATFORM_EVENTS.AUTH_LOGOUT,
        ctx.moduleId,
        {},
        { traceId: ctx.traceId },
      );
      return null;
    });

    r.register(NAMESPACES.PERMISSIONS, ACTIONS.PERMISSIONS.HAS, (payload) =>
      this.services.permissions.has((payload as { permission?: string })?.permission ?? ''),
    );
    r.register(NAMESPACES.PERMISSIONS, ACTIONS.PERMISSIONS.LIST, () =>
      this.services.permissions.list(),
    );

    r.register(NAMESPACES.FLAGS, ACTIONS.FLAGS.IS_ENABLED, (payload, ctx) =>
      this.services.flags.isEnabled((payload as { flag?: string })?.flag ?? '', ctx.moduleId),
    );
    r.register(NAMESPACES.FLAGS, ACTIONS.FLAGS.GET_ALL, (_, ctx) =>
      this.services.flags.getAll(ctx.moduleId),
    );

    r.register(NAMESPACES.CONFIG, ACTIONS.CONFIG.GET, (payload, ctx) =>
      this.services.config.get((payload as { key?: string })?.key ?? '', ctx.moduleId),
    );
    r.register(NAMESPACES.CONFIG, ACTIONS.CONFIG.GET_ALL, (_, ctx) =>
      this.services.config.getAll(ctx.moduleId),
    );

    r.register(NAMESPACES.NAVIGATION, ACTIONS.NAVIGATION.NAVIGATE, async (payload, ctx) => {
      const target = payload as unknown as NavigationTarget;
      if (!this.authorizeNavigation(ctx.moduleId, target)) {
        throw new RpcMethodError('NAVIGATION_DENIED', 'Navigation not authorized');
      }
      await this.services.navigation.navigate(target);
      await this.eventBus.emit(
        PLATFORM_EVENTS.NAVIGATION_REQUEST,
        ctx.moduleId,
        target,
        { traceId: ctx.traceId },
      );
      return null;
    });
    r.register(NAMESPACES.NAVIGATION, ACTIONS.NAVIGATION.GET_CURRENT, () =>
      this.services.navigation.getCurrent(),
    );

    // platform.getType returns `{ type, appearance }`. `type` MUST be a
    // PlatformTypeLiteral ("web" / "flutter"), not the whole device.info()
    // object — the SDK stores it as `platform.type` and derives
    // isWeb()/isFlutter()/isMobile() from it.
    //
    // `appearance` piggybacks the active locale/theme onto a request the mini
    // app is already awaiting, so it starts in the right locale/theme without
    // two further `appearance.*` round trips. It's the only channel the
    // Flutter shell has (it serves no `appearance` namespace), and this host
    // uses the same one so both shells drive one SDK code path.
    //
    // Send the full LocaleState/ThemeState objects rather than bare strings:
    // given a string, the SDK would re-derive `direction` from the language
    // subtag. This host already computes it, and its answer is authoritative.
    //
    // Best-effort — a failed appearance lookup must not fail `getType`, which
    // gates the mini app's entire startup. Older SDKs ignore the extra field
    // and fall back to the `appearance` namespace, which stays registered.
    r.register(NAMESPACES.PLATFORM, ACTIONS.PLATFORM.GET_TYPE, async () => {
      const info = await this.services.device.info();
      const raw = (info as unknown as { platform?: string }).platform ?? 'web';
      const type = raw.toUpperCase().startsWith('WEB') ? 'web' : 'flutter';

      try {
        const [locale, theme] = await Promise.all([
          this.services.appearance.getLocale(),
          this.services.appearance.getTheme(),
        ]);
        return { type, appearance: { locale, theme } };
      } catch {
        return { type };
      }
    });
    r.register(NAMESPACES.PLATFORM, 'isWeb', async () => {
      const info = await this.services.device.info();
      return String((info as unknown as { platform?: string }).platform ?? 'web')
        .toUpperCase()
        .startsWith('WEB');
    });
    r.register(NAMESPACES.PLATFORM, 'isAndroid', () => false);
    r.register(NAMESPACES.PLATFORM, 'isIOS', () => false);
    r.register(NAMESPACES.PLATFORM, 'isMobile', () => false);

    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.LOCATION, async (payload) => {
      try {
        return await this.services.device.location(payload as Record<string, unknown>);
      } catch (err) {
        return {
          status: 'denied',
          error: err instanceof Error ? err.message : 'Location access denied',
        };
      }
    });
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.CAMERA, (payload) =>
      this.services.device.camera(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.GALLERY, (payload) =>
      this.services.device.gallery(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.FILES, (payload) =>
      this.services.device.files(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, 'download', (payload) =>
      this.services.device.download(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, 'contact', (payload) =>
      this.services.device.contact(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.BIOMETRIC, (payload) =>
      this.services.device.biometric(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.NOTIFICATIONS, (payload) =>
      this.services.device.notifications(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.NETWORK, () =>
      this.services.device.network(),
    );
    r.register(NAMESPACES.DEVICE, 'storage', (payload) => {
      const action = (payload as { action?: string })?.action ?? '';
      const key = (payload as { key?: string })?.key ?? '';
      const value = (payload as { value?: string })?.value ?? '';
      switch (action) {
        case 'get':
          return this.services.device.storage.get(key);
        case 'set':
          return this.services.device.storage.set(key, value).then(() => value);
        case 'remove':
          return this.services.device.storage.remove(key).then(() => null);
        default:
          return null;
      }
    });
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.INFO, () =>
      this.services.device.info(),
    );

    r.register(NAMESPACES.STORAGE, ACTIONS.STORAGE.GET, (payload) => {
      const key = (payload as { key?: string })?.key;
      if (!key) throw new RpcMethodError('INVALID_PARAMS', 'Missing key');
      return this.services.storage.get(key);
    });
    r.register(NAMESPACES.STORAGE, ACTIONS.STORAGE.SET, (payload) => {
      const { key, value } = payload as { key?: string; value?: string };
      if (!key) throw new RpcMethodError('INVALID_PARAMS', 'Missing key');
      return this.services.storage.set(key, value ?? '').then(() => null);
    });
    r.register(NAMESPACES.STORAGE, ACTIONS.STORAGE.REMOVE, (payload) => {
      const key = (payload as { key?: string })?.key;
      if (!key) throw new RpcMethodError('INVALID_PARAMS', 'Missing key');
      return this.services.storage.remove(key).then(() => null);
    });

    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.GET, (payload) =>
      this.handleHttpRequest('get', payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.POST, (payload) =>
      this.handleHttpRequest('post', payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.PUT, (payload) =>
      this.handleHttpRequest('put', payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.PATCH, (payload) =>
      this.handleHttpRequest('patch', payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.DELETE, (payload) =>
      this.handleHttpRequest('delete', payload as Record<string, unknown>),
    );

    r.register(NAMESPACES.API, ACTIONS.API.REQUEST, async (payload) => {
      const apiPayload = payload as {
        method?: string;
        path?: string;
        body?: unknown;
        headers?: Record<string, string>;
      } | undefined;
      if (!apiPayload?.method || !apiPayload?.path) {
        throw new RpcMethodError('INVALID_PARAMS', 'Missing method or path');
      }
      try {
        const res = await axios({
          method: apiPayload.method,
          url: apiPayload.path,
          data: apiPayload.body,
          headers: await this.withAppearanceHeaders(apiPayload.headers),
        });
        const headers: Record<string, string> = {};
        if (res.headers) {
          Object.entries(res.headers).forEach(([k, v]) => {
            headers[k] = String(v);
          });
        }
        return { status: res.status, data: res.data, headers };
      } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
          const headers: Record<string, string> = {};
          if (err.response.headers) {
            Object.entries(err.response.headers).forEach(([k, v]) => {
              headers[k] = String(v);
            });
          }
          return { status: err.response.status, data: err.response.data, headers };
        }
        throw new RpcMethodError(
          'API_ERROR',
          err instanceof Error ? err.message : String(err),
        );
      }
    });

    // Appearance — the host notifies mini apps of locale/theme changes; apps
    // read current state on demand. The host owns no mini-app content.
    r.register(NAMESPACES.APPEARANCE, ACTIONS.APPEARANCE.GET_LOCALE, () =>
      this.services.appearance.getLocale(),
    );
    r.register(NAMESPACES.APPEARANCE, ACTIONS.APPEARANCE.GET_THEME, () =>
      this.services.appearance.getTheme(),
    );

    // Events — subscription bookkeeping lives on the ConnectedModule and is
    // consulted by broadcastToModules().
    r.register(NAMESPACES.EVENT, ACTIONS.EVENT.SUBSCRIBE, (payload, ctx) => {      const eventType = (payload as { eventType?: string })?.eventType;
      if (eventType) this.modules.get(ctx.moduleId)?.eventSubscriptions.add(eventType);
      return null;
    });
    r.register(NAMESPACES.EVENT, ACTIONS.EVENT.UNSUBSCRIBE, (payload, ctx) => {
      const eventType = (payload as { eventType?: string })?.eventType;
      if (eventType) this.modules.get(ctx.moduleId)?.eventSubscriptions.delete(eventType);
      return null;
    });
    // SDK sends { event, data } — NOT { eventType, payload }.
    r.register(NAMESPACES.EVENT, ACTIONS.EVENT.EMIT, async (payload, ctx) => {
      const { event, data } = (payload ?? {}) as {
        event?: string;
        data?: unknown;
      };
      if (!event) {
        throw new RpcMethodError('INVALID_PARAMS', 'Missing event name');
      }
      await this.eventBus.emit(event, ctx.moduleId, data, {
        traceId: ctx.traceId,
      });
      return null;
    });

    r.register('ai', 'chat', async (payload, ctx) => {
      const chatPayload = payload as {
        messages?: { role: string; content: string }[];
        options?: Record<string, unknown>;
      };
      if (!chatPayload?.messages || chatPayload.messages.length === 0) {
        throw new RpcMethodError('INVALID_PARAMS', 'Missing messages');
      }

      const chatMessages = chatPayload.messages.map((m) => ({
        ...m,
        role: m.role as 'user' | 'system' | 'ai',
      }));
      this.streamChatChunks(
        ctx,
        this.services.chat.chat(chatMessages, chatPayload.options ?? {}),
      ).catch((err) => {
        ctx.send(
          createMessage(
            'response',
            'ai',
            'chat',
            'shell',
            ctx.moduleId,
            undefined,
            {
              id: ctx.requestId,
              traceId: ctx.traceId,
              error: {
                code: 'CHAT_ERROR',
                message: err instanceof Error ? err.message : String(err),
              },
            },
          ),
          ctx.source,
        );
      });

      return { streaming: true };
    });

    r.register('sdk', 'invoke', async (payload, ctx) => {
      const invokeMethod = (payload as { method?: string })?.method;
      const invokePayload = (payload as { payload?: unknown })?.payload;
      const serviceModule = this.findServiceModule(invokeMethod ?? '');
      if (!serviceModule) {
        throw new RpcMethodError(
          'SERVICE_NOT_FOUND',
          `No service registered for: ${invokeMethod}`,
        );
      }
      return this.forwardToModule(
        invokeMethod ?? '',
        invokePayload,
        ctx,
        serviceModule,
      );
    });

    r.register('sdk', 'register', (payload, ctx) => {
      const registerMethod = (payload as { method?: string })?.method;
      if (!registerMethod) {
        throw new RpcMethodError('INVALID_PARAMS', 'Invalid registration');
      }
      const existing = this.serviceRegistry.get(registerMethod);
      if (existing && existing.moduleId !== ctx.moduleId) {
        throw new RpcMethodError(
          'SERVICE_CONFLICT',
          `Service ${registerMethod} already registered by ${existing.moduleId}`,
        );
      }
      this.serviceRegistry.set(registerMethod, {
        moduleId: ctx.moduleId,
        method: registerMethod,
      });
      return null;
    });
  }

  // ---------------------------------------------------------------------------
  // HTTP proxy helpers
  // ---------------------------------------------------------------------------

  /**
   * Merges the active locale into an outbound request's headers so the backend
   * can localize dynamic content at request time (see HOST-APPEARANCE-ARCHITECTURE
   * Q5). Best-effort: a failed/absent appearance lookup falls back to the
   * caller's headers untouched.
   */
  private async withAppearanceHeaders(headers?: Record<string, string>): Promise<Record<string, string>> {
    try {
      const locale = await this.services.appearance.getLocale();
      return { ...headers, 'Accept-Language': locale.locale };
    } catch {
      return headers ?? {};
    }
  }

  private async handleHttpRequest(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const endpoint = payload.endpoint as string | undefined;
    if (!endpoint) {
      throw new RpcMethodError('INVALID_PARAMS', 'Missing endpoint');
    }
    try {
      const res = await axios({
        method,
        url: endpoint,
        params: method === 'get' ? payload.query : undefined,
        data: method === 'delete' ? undefined : payload.body,
        headers: await this.withAppearanceHeaders(payload.headers as Record<string, string> | undefined),
      });
      const headers: Record<string, string> = {};
      if (res.headers) {
        Object.entries(res.headers).forEach(([k, v]) => {
          headers[k] = String(v);
        });
      }
      return {
        status: res.status,
        data: res.data,
        headers,
        url: res.config.url ?? endpoint,
        links: {
          requestUrl: res.config.url ?? endpoint,
          self: endpoint,
        },
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const headers: Record<string, string> = {};
        if (err.response.headers) {
          Object.entries(err.response.headers).forEach(([k, v]) => {
            headers[k] = String(v);
          });
        }
        return {
          status: err.response.status,
          data: err.response.data,
          headers,
          url: err.config?.url ?? endpoint,
          links: {
            requestUrl: err.config?.url ?? endpoint,
            self: endpoint,
          },
        };
      }
      throw new RpcMethodError(
        'HTTP_ERROR',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Event broadcast
  // ---------------------------------------------------------------------------

  /**
   * Forward a published platform event to every connected module that
   * subscribed to its type. Event type → `namespace.action` is split on the
   * FIRST dot so multi-part actions (`navigation.route.changed` →
   * namespace `navigation`, action `route.changed`) survive intact — the SDK
   * re-assembles subscribers from `${namespace}.${action}`.
   */
  private broadcastToModules(event: PlatformEvent): void {
    const { namespace, action } = splitEventType(event.type);
    const message = createMessage(
      'event',
      namespace,
      action,
      'shell',
      '*',
      event.payload,
      { traceId: event.traceId },
    );

    for (const module of this.modules.values()) {
      const subscribed = Array.from(module.eventSubscriptions).some(
        (pattern) => this.matchesSubscription(event.type, pattern),
      );
      if (!subscribed) continue;
      this.transport.send(
        { ...message, target: module.moduleId },
        window,
      );
    }
  }

  private matchesSubscription(eventType: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return eventType.startsWith(pattern.slice(0, -1));
    }
    return eventType === pattern;
  }

  // ---------------------------------------------------------------------------
  // sdk.invoke forwarding
  // ---------------------------------------------------------------------------

  private findServiceModule(method: string): ServiceEntry | undefined {
    return this.serviceRegistry.get(method);
  }

  private async forwardToModule(
    method: string,
    payload: unknown,
    ctx: RpcContext,
    target: ServiceEntry,
  ): Promise<unknown> {
    const [ns, ...rest] = method.split('.');
    const action = rest.join('.');
    const request = createMessage(
      'request',
      ns,
      action,
      ctx.moduleId,
      target.moduleId,
      payload,
      { traceId: ctx.traceId },
    );

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.requestId);
        reject(
          new RpcMethodError(
            'FORWARD_TIMEOUT',
            `Service ${method} timed out`,
          ),
        );
      }, 30000);

      this.pendingRequests.set(request.requestId, {
        resolve: (msg: HostPlatformMessage) => {
          clearTimeout(timer);
          if (msg.error) {
            reject(
              new RpcMethodError(
                msg.error.code,
                msg.error.message,
                msg.error.retryable ?? false,
              ),
            );
            return;
          }
          resolve(msg.payload);
        },
        timer,
      });
      this.transport.send(request);
    });
  }

  // ---------------------------------------------------------------------------
  // Chat streaming
  // ---------------------------------------------------------------------------

  private async streamChatChunks(
    ctx: RpcContext,
    iter: AsyncIterable<string>,
  ): Promise<void> {
    let index = 1;

    for await (const chunk of iter) {
      const text =
        typeof chunk === 'string'
          ? chunk
          : new TextDecoder().decode(chunk);

      ctx.send(
        createMessage(
          'stream',
          'ai',
          'chat',
          'shell',
          ctx.moduleId,
          text,
          {
            id: ctx.requestId,
            traceId: ctx.traceId,
            streamIndex: index,
            streamLast: false,
          },
        ),
        ctx.source,
      );
      index++;
    }

    ctx.send(
      createMessage(
        'stream',
        'ai',
        'chat',
        'shell',
        ctx.moduleId,
        '',
        {
          id: ctx.requestId,
          traceId: ctx.traceId,
          streamIndex: index,
          streamLast: true,
        },
      ),
      ctx.source,
    );
  }

  // ---------------------------------------------------------------------------
  // Response helpers & guards
  // ---------------------------------------------------------------------------

  private okResponse(
    request: HostPlatformMessage,
    payload: unknown,
  ): HostPlatformMessage {
    return createMessage(
      'response',
      request.namespace,
      request.action,
      'shell',
      request.source,
      payload,
      {
        id: request.requestId,
        traceId: request.traceId,
      },
    );
  }

  private errorResponse(
    request: HostPlatformMessage,
    code: string,
    message: string,
    retryable = false,
  ): HostPlatformMessage {
    return createMessage(
      'response',
      request.namespace,
      request.action,
      'shell',
      request.source,
      undefined,
      {
        id: request.requestId,
        traceId: request.traceId,
        error: { code, message, retryable },
      },
    );
  }

  private isOriginAllowed(origin: string): boolean {
    if (this.allowedOrigins.includes('*')) return true;
    return this.allowedOrigins.some(
      (allowed) => origin === allowed || origin.endsWith(allowed),
    );
  }

  private isMethodAllowed(namespace: string, module: ConnectedModule): boolean {
    return module.capabilities.includes(namespace);
  }

  private authorizeNavigation(
    moduleId: string,
    target: NavigationTarget,
  ): boolean {
    return Boolean(moduleId && target.app && target.route);
  }

  private negotiateVersion(sdkProtocolVersion: string): string {
    const [major] = sdkProtocolVersion.split('.');
    const [shellMajor] = PROTOCOL_VERSION.split('.');
    if (major === shellMajor) return PROTOCOL_VERSION;
    return `${shellMajor}.0.0`;
  }
}

export function createRpcServer(options: RpcServerOptions): RpcServer {
  return new RpcServer(options);
}
