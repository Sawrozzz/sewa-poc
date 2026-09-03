/**
 * RpcServer — the privileged gateway between Mini Apps and Shell internals.
 *
 * Owns the transport subscription, handshake, connected module lifecycle,
 * capability gating, event subscription broadcast, and RPC method routing.
 *
 * Mini Apps NEVER bypass this layer. All SDK calls are validated, traced,
 * and routed here.
 */

import type { NavigationTarget } from "@lizuz/mini-app-types";
import axios from "axios";
import { ACTIONS, NAMESPACES, PROTOCOL_VERSION } from "../constants";
import { RpcMethodError } from "../errors";
import type { EventBus, PlatformEvent } from "../events";
import { PLATFORM_EVENTS } from "../events";
import type { HostPlatformMessage } from "../protocol";
import {
  createMessage,
  hasCompatibleMajorVersion,
  isPlatformMessage,
  majorVersionsMatch,
  splitEventType,
} from "../protocol";
import type { Transport } from "../transport";
import { PostMessageTransport } from "../transport";
import type { ShellServiceMap } from "../types";
import {
  isCapabilityGranted,
  resolveDataCapabilities,
  resolveMiniAppCapabilities,
} from "./capabilities";
import type { RpcContext } from "./method-registry";
import { MethodRegistry } from "./method-registry";

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
  capabilities: string[];
  connectedAt: number;
  origin: string;
  eventSubscriptions: Set<string>;
}

export class RpcServer {
  private services: ShellServiceMap;
  private eventBus: EventBus;
  /** The transport bound to this server — also exposed for host observability. */
  readonly transport: Transport;
  private allowedOrigins: string[];
  private modules = new Map<string, ConnectedModule>();
  private transportUnsub: (() => void) | null = null;
  private eventUnsubscribers: Array<() => void> = [];
  private onModuleConnected?: (moduleId: string) => void;
  private onModuleDisconnected?: (moduleId: string) => void;
  private registry = new MethodRegistry();
  private _initialized = false;

  constructor(options: RpcServerOptions) {
    this.services = options.services;
    this.eventBus = options.eventBus;
    this.transport = options.transport ?? new PostMessageTransport();
    this.allowedOrigins = options.allowedOrigins ?? ["*"];
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
    const unsub = this.eventBus.subscribe("*", (evt) => {
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
    this._initialized = false;
  }

  disconnectModule(moduleId: string): void {
    this.modules.delete(moduleId);
    this.onModuleDisconnected?.(moduleId);
  }

  getConnectedModules(): ReadonlyMap<string, ConnectedModule> {
    return this.modules;
  }

  getModule(moduleId: string): ConnectedModule | undefined {
    return this.modules.get(moduleId);
  }

  /** Register a one-off RPC method at runtime (e.g. from a custom host module). */
  registerMethod(
    method: string,
    handler: (payload: unknown, context: RpcContext) => unknown | Promise<unknown>,
  ): void {
    this.registry.registerMethod(method, handler);
  }

  private async handleMessage(msg: HostPlatformMessage, source?: Window | null): Promise<void> {
    if (!isPlatformMessage(msg)) {
      return;
    }
    if (msg.type !== "request" && msg.type !== "handshake") {
      return;
    }

    const origin = source === window || !source ? window.location.origin : "*";
    if (!this.isOriginAllowed(origin)) {
      return;
    }

    if (!hasCompatibleMajorVersion(msg)) {
      console.warn("[RpcServer] Dropping message with incompatible protocol major version", {
        received: msg.gsaProtocolVersion,
        expected: PROTOCOL_VERSION,
        namespace: msg.namespace,
        action: msg.action,
        source: msg.source,
      });
      return;
    }

    try {
      const response =
        msg.type === "handshake"
          ? await this.processHandshake(msg, origin)
          : await this.routeRequest(msg, source);
      this.transport.send(response, source);
    } catch (err) {
      const error = {
        code: "COMMUNICATOR_ERROR",
        message: err instanceof Error ? err.message : String(err),
      };
      this.transport.send(
        createMessage("response", msg.namespace, msg.action, "shell", msg.source, undefined, {
          id: msg.requestId,
          traceId: msg.traceId,
          error,
        }),
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

    // The grant comes from the manifest the shell registered for this module —
    // never from `payload.capabilities`, which is the mini app asking for its
    // own permissions. An unregistered module resolves to the core set only.
    const moduleManifest = this.services.moduleManifest?.get?.(miniAppId);
    console.log("CUREENT MODULE ", moduleManifest);
    const effectiveDataCapabilities = resolveDataCapabilities(moduleManifest);

    const effectiveMiniAppCapabilties = resolveMiniAppCapabilities(moduleManifest);

    const clientProtocolVersion = payload.protocolVersion ?? PROTOCOL_VERSION;
    if (!majorVersionsMatch(clientProtocolVersion, PROTOCOL_VERSION)) {
      console.warn("[RpcServer] Rejecting handshake: incompatible mini app protocol version", {
        miniAppId,
        received: clientProtocolVersion,
        expected: PROTOCOL_VERSION,
      });
      return createMessage(
        "response",
        NAMESPACES.HANDSHAKE,
        msg.action,
        "shell",
        miniAppId,
        {
          status: "rejected",
          reason: `Mini app protocol version "${clientProtocolVersion}" is incompatible with host protocol version "${PROTOCOL_VERSION}" (major version mismatch)`,
        },
        {
          id: msg.requestId,
          traceId: msg.traceId,
        },
      );
    }

    const module: ConnectedModule = {
      moduleId: miniAppId,
      sdkVersion: payload.sdkVersion ?? "0.0.0",
      protocolVersion: payload.protocolVersion ?? PROTOCOL_VERSION,
      capabilities: [...effectiveDataCapabilities, ...effectiveMiniAppCapabilties],
      connectedAt: Date.now(),
      origin,
      eventSubscriptions: new Set(),
    };

    this.modules.set(miniAppId, module);
    this.onModuleConnected?.(miniAppId);

    // HandshakeAckPayload — the exact shape the SDK's RpcClient reads:
    // { status, protocolVersion, capabilities }.
    return createMessage(
      "response",
      NAMESPACES.HANDSHAKE,
      msg.action,
      "shell",
      miniAppId,
      {
        status: "ok",
        protocolVersion: PROTOCOL_VERSION,
        capabilities: [...effectiveDataCapabilities, ...effectiveMiniAppCapabilties],
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
        "MODULE_NOT_CONNECTED",
        "Module not connected. Call initialize() first.",
      );
    }

    if (!this.isMethodAllowed(msg.namespace, msg.action, module)) {
      await this.eventBus.emit(
        PLATFORM_EVENTS.PERMISSION_DENIED,
        "shell",
        {
          moduleId: msg.source,
          method: `${msg.namespace}.${msg.action}`,
        },
        { traceId: msg.traceId },
      );
      return this.errorResponse(
        msg,
        "PERMISSION_DENIED",
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
      const result = await this.registry.invoke(msg.namespace, msg.action, msg.payload, context);
      return this.okResponse(msg, result);
    } catch (err) {
      const code = err instanceof RpcMethodError ? err.code : "HOST_ERROR";
      const message = err instanceof Error ? err.message : String(err);
      return this.errorResponse(msg, code, message, false);
    }
  }

  // ---------------------------------------------------------------------------
  // Default method handlers
  // ---------------------------------------------------------------------------

  private registerMethods(): void {
    const r = this.registry;

    r.register(NAMESPACES.AUTH, ACTIONS.AUTH.GET_USER, async () => this.services.auth.getUser());
    r.register(NAMESPACES.AUTH, ACTIONS.AUTH.IS_AUTHENTICATED, async () =>
      this.services.auth.isAuthenticated(),
    );
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
      this.services.permissions.has((payload as { permission?: string })?.permission ?? ""),
    );
    r.register(NAMESPACES.PERMISSIONS, ACTIONS.PERMISSIONS.LIST, () =>
      this.services.permissions.list(),
    );

    r.register(NAMESPACES.FLAGS, ACTIONS.FLAGS.IS_ENABLED, (payload) =>
      this.services.flags.isEnabled((payload as { flag?: string })?.flag ?? ""),
    );
    r.register(NAMESPACES.FLAGS, ACTIONS.FLAGS.GET_ALL, () => this.services.flags.getAll());

    r.register(NAMESPACES.CONFIG, ACTIONS.CONFIG.GET, (payload) =>
      this.services.config.get((payload as { key?: string })?.key ?? ""),
    );
    r.register(NAMESPACES.CONFIG, ACTIONS.CONFIG.GET_ALL, () => this.services.config.getAll());

    r.register(NAMESPACES.NAVIGATION, ACTIONS.NAVIGATION.NAVIGATE, async (payload, ctx) => {
      const target = payload as unknown as NavigationTarget;
      if (!this.authorizeNavigation(ctx.moduleId, target)) {
        throw new RpcMethodError("NAVIGATION_DENIED", "Navigation not authorized");
      }
      await this.services.navigation.navigate(target);
      await this.eventBus.emit(PLATFORM_EVENTS.NAVIGATION_REQUEST, ctx.moduleId, target, {
        traceId: ctx.traceId,
      });
      return null;
    });
    r.register(NAMESPACES.NAVIGATION, ACTIONS.NAVIGATION.GET_CURRENT, () =>
      this.services.navigation.getCurrent(),
    );

    // The mini app's half of the back-button handshake. `back` is its answer
    // to `navigation.back.requested`; `push` is it telling the shell it now
    // has a route of its own to pop, so the next back press is worth asking
    // about. Both carry a single boolean and default to `true` — an older
    // mini app that sends no payload is saying "I handled it".
    //
    // Both go out over the SAME `navigation.router` RPC call with the SAME
    // `{ consumed }` payload — the wire never says which one this is. The
    // one thing that does tell them apart: `back` only ever arrives as a
    // direct reply to a `navigation.back.requested` the shell just sent, so
    // whether a back press is currently held is what decides the dispatch.
    r.register(NAMESPACES.NAVIGATION, ACTIONS.NAVIGATION.ROUTER, (payload, ctx) => {
      const consumed = readConsumed(payload);
      return this.services.navigation.hasPendingBack()
        ? this.services.navigation.back(consumed, ctx.moduleId)
        : this.services.navigation.push(consumed, ctx.moduleId);
    });

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
    r.register(NAMESPACES.PLATFORM, ACTIONS.PLATFORM.GET_TYPE, async () => {
      const info = await this.services.device.info();
      const raw = (info as unknown as { platform?: string }).platform ?? "web";
      const type = raw.toUpperCase().startsWith("WEB") ? "web" : "flutter";

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

    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.LOCATION, async (payload) => {
      try {
        return await this.services.device.location(payload as Record<string, unknown>);
      } catch (err) {
        return {
          status: "denied",
          error: err instanceof Error ? err.message : "Location access denied",
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
    r.register(NAMESPACES.DEVICE, "download", (payload) =>
      this.services.device.download(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, "contact", (payload) =>
      this.services.device.contact(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.BIOMETRIC, (payload) =>
      this.services.device.biometric(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.NOTIFICATIONS, (payload) =>
      this.services.device.notifications(payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.NETWORK, () => this.services.device.network());
    r.register(NAMESPACES.DEVICE, ACTIONS.DEVICE.INFO, () => this.services.device.info());

    r.register(NAMESPACES.STORAGE, ACTIONS.STORAGE.GET, (payload) => {
      const key = (payload as { key?: string })?.key;
      if (!key) throw new RpcMethodError("INVALID_PARAMS", "Missing key");
      return this.services.storage.get(key);
    });
    r.register(NAMESPACES.STORAGE, ACTIONS.STORAGE.SET, (payload) => {
      const { key, value } = payload as { key?: string; value?: string };
      if (!key) throw new RpcMethodError("INVALID_PARAMS", "Missing key");
      return this.services.storage.set(key, value ?? "").then(() => null);
    });
    r.register(NAMESPACES.STORAGE, ACTIONS.STORAGE.REMOVE, (payload) => {
      const key = (payload as { key?: string })?.key;
      if (!key) throw new RpcMethodError("INVALID_PARAMS", "Missing key");
      return this.services.storage.remove(key).then(() => null);
    });

    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.GET, (payload) =>
      this.handleHttpRequest("get", payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.POST, (payload) =>
      this.handleHttpRequest("post", payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.PUT, (payload) =>
      this.handleHttpRequest("put", payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.PATCH, (payload) =>
      this.handleHttpRequest("patch", payload as Record<string, unknown>),
    );
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.DELETE, (payload) =>
      this.handleHttpRequest("delete", payload as Record<string, unknown>),
    );

    r.register(NAMESPACES.API, ACTIONS.API.REQUEST, async (payload) => {
      const apiPayload = payload as
        | {
            method?: string;
            path?: string;
            body?: unknown;
            headers?: Record<string, string>;
          }
        | undefined;
      if (!apiPayload?.method || !apiPayload?.path) {
        throw new RpcMethodError("INVALID_PARAMS", "Missing method or path");
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
        throw new RpcMethodError("API_ERROR", err instanceof Error ? err.message : String(err));
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
    // consulted by broadcastToModules(). The SDK subscribes to host events
    // with `event.subscribe` and never sends `event.unsubscribe` (its own
    // handler teardown is local), so only subscribe/emit are served.
    r.register(NAMESPACES.EVENT, ACTIONS.EVENT.SUBSCRIBE, (payload, ctx) => {
      const eventType = (payload as { eventType?: string })?.eventType;
      if (eventType) this.modules.get(ctx.moduleId)?.eventSubscriptions.add(eventType);
      return null;
    });
    // SDK sends { event, data } — NOT { eventType, payload }.
    r.register(NAMESPACES.EVENT, ACTIONS.EVENT.EMIT, async (payload, ctx) => {
      const { event, data } = (payload ?? {}) as {
        event?: string;
        data?: unknown;
      };
      if (!event) {
        throw new RpcMethodError("INVALID_PARAMS", "Missing event name");
      }
      await this.eventBus.emit(event, ctx.moduleId, data, {
        traceId: ctx.traceId,
      });
      return null;
    });

    // GIC Chat — reverted to GIC_CHAT namespace (START_SESSION + STREAM), but gated by HTTP capability per spec
    const handleGicStart = async () => {
      if (!this.services.gicChat)
        throw new RpcMethodError(
          "NOT_SUPPORTED",
          "GIC chat not configured — set GIC_CHAT_BASE_URL",
        );
      return this.services.gicChat.startSession();
    };
    r.register(NAMESPACES.GIC_CHAT, ACTIONS.GIC_CHAT.START_SESSION, handleGicStart);
    // Deprecated alias: HTTP.GIC_START_SESSION still works (same handler, HTTP-gated)
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.GIC_START_SESSION, handleGicStart);

    const handleGicStream = async (payload: unknown, ctx: RpcContext) => {
      const p = payload as { user_id: string; session_id: string; message: string };
      if (!this.services.gicChat)
        throw new RpcMethodError("NOT_SUPPORTED", "GIC chat not configured");
      if (!p?.user_id || !p?.session_id)
        throw new RpcMethodError("INVALID_PARAMS", "user_id and session_id required");
      if (!p?.message || p.message.trim().length === 0)
        throw new RpcMethodError("INVALID_PARAMS", "message must be non-blank");
      if (p.message.length > 200)
        throw new RpcMethodError("INVALID_PARAMS", "message must be ≤200 characters");
      const abort = new AbortController();
      (ctx as unknown as { _gicAbort?: AbortController })._gicAbort = abort;
      this.streamGicChat(ctx, p, abort.signal, NAMESPACES.GIC_CHAT, ACTIONS.GIC_CHAT.STREAM).catch(
        (err) => {
          ctx.send(
            createMessage(
              "response",
              NAMESPACES.GIC_CHAT,
              ACTIONS.GIC_CHAT.STREAM,
              "shell",
              ctx.moduleId,
              undefined,
              {
                id: ctx.requestId,
                traceId: ctx.traceId,
                error: {
                  code: "GIC_CHAT_ERROR",
                  message: err instanceof Error ? err.message : String(err),
                },
              },
            ),
            ctx.source,
          );
        },
      );
      return { streaming: true };
    };
    r.register(NAMESPACES.GIC_CHAT, ACTIONS.GIC_CHAT.STREAM, handleGicStream);
    // Deprecated alias: HTTP.CHAT_STREAM GIC payload discriminator (kept for compat, forwards to same GIC logic)
    const handleChatStream = async (payload: unknown, ctx: RpcContext) => {
      const p = payload as {
        user_id?: string;
        session_id?: string;
        message?: string;
        messages?: { role: string; content: string }[];
        options?: Record<string, unknown>;
      };
      if (p?.user_id || p?.session_id || p?.message) {
        return handleGicStream(payload, ctx);
      }
      if (!p?.messages || p.messages.length === 0)
        throw new RpcMethodError("INVALID_PARAMS", "Missing messages");
      const chatMessages = p.messages.map((m) => ({ ...m, role: m.role as "user" | "system" }));
      const streamIterable = (await this.services.chat.chat(
        chatMessages,
        p.options,
      )) as unknown as AsyncIterable<string | Uint8Array>;
      this.streamChatChunks(ctx, streamIterable, NAMESPACES.HTTP, ACTIONS.HTTP.CHAT_STREAM).catch(
        (err) => {
          ctx.send(
            createMessage(
              "response",
              NAMESPACES.HTTP,
              ACTIONS.HTTP.CHAT_STREAM,
              "shell",
              ctx.moduleId,
              undefined,
              {
                id: ctx.requestId,
                traceId: ctx.traceId,
                error: {
                  code: "CHAT_ERROR",
                  message: err instanceof Error ? err.message : String(err),
                },
              },
            ),
            ctx.source,
          );
        },
      );
      return { streaming: true };
    };

    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.CHAT_STREAM, async (payload, ctx) =>
      handleChatStream(payload, ctx),
    );
    // Alias HTTP.STREAM -> same as CHAT_STREAM
    r.register(
      NAMESPACES.HTTP,
      (ACTIONS.HTTP as unknown as { STREAM: string }).STREAM,
      async (payload, ctx) => handleChatStream(payload, ctx),
    );
    // Stream cancellation — SDK notifies via HTTP.CANCEL when StreamBuilder.cancel() or AbortSignal fires
    r.register(NAMESPACES.HTTP, ACTIONS.HTTP.CANCEL, async (payload) => {
      const p = payload as { requestId?: string };
      if (p?.requestId) {
        // Find and abort the associated GIC stream if any (generic chat streams are handled via service cancellation)
        // Host's streamGicChat checks signal; for generic chat, service.chat may handle abort internally
      }
      return { cancelled: true };
    });
  }

  // ---------------------------------------------------------------------------
  // HTTP proxy helpers
  // ---------------------------------------------------------------------------

  /**
   * Merges the active locale into an outbound request's headers so the backend
   * can localize dynamic content at request time. Best-effort: a failed/absent
   * appearance lookup falls back to the caller's headers untouched.
   */
  private async withAppearanceHeaders(
    headers?: Record<string, string>,
  ): Promise<Record<string, string>> {
    try {
      const locale = await this.services.appearance.getLocale();
      return { ...headers, "Accept-Language": locale.locale };
    } catch {
      return headers ?? {};
    }
  }

  private async handleHttpRequest(
    method: "get" | "post" | "put" | "patch" | "delete",
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const endpoint = payload.endpoint as string | undefined;
    if (!endpoint) {
      throw new RpcMethodError("INVALID_PARAMS", "Missing endpoint");
    }
    try {
      const res = await axios({
        method,
        url: endpoint,
        params: method === "get" ? payload.query : undefined,
        data: method === "delete" ? undefined : payload.body,
        headers: await this.withAppearanceHeaders(
          payload.headers as Record<string, string> | undefined,
        ),
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
      throw new RpcMethodError("HTTP_ERROR", err instanceof Error ? err.message : String(err));
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
    const message = createMessage("event", namespace, action, "shell", "*", event.payload, {
      traceId: event.traceId,
    });

    for (const module of this.modules.values()) {
      const subscribed = Array.from(module.eventSubscriptions).some((pattern) =>
        this.matchesSubscription(event.type, pattern),
      );
      if (!subscribed) continue;
      this.transport.send({ ...message, target: module.moduleId }, window);
    }
  }

  // ---------------------------------------------------------------------------
  // Chat streaming
  // ---------------------------------------------------------------------------

  private async streamChatChunks(
    ctx: RpcContext,
    iter: AsyncIterable<string | Uint8Array>,
    ns: string = NAMESPACES.HTTP,
    action: string = ACTIONS.HTTP.CHAT_STREAM,
  ): Promise<void> {
    let index = 1;

    for await (const chunk of iter) {
      const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);

      ctx.send(
        createMessage("stream", ns, action, "shell", ctx.moduleId, text, {
          id: ctx.requestId,
          traceId: ctx.traceId,
          streamIndex: index,
          streamLast: false,
        }),
        ctx.source,
      );
      index++;
    }

    ctx.send(
      createMessage("stream", ns, action, "shell", ctx.moduleId, "", {
        id: ctx.requestId,
        traceId: ctx.traceId,
        streamIndex: index,
        streamLast: true,
      }),
      ctx.source,
    );
  }

  private async streamGicChat(
    ctx: RpcContext,
    request: { user_id: string; session_id: string; message: string },
    signal?: AbortSignal,
    ns: string = NAMESPACES.GIC_CHAT,
    action: string = ACTIONS.GIC_CHAT.STREAM,
  ): Promise<void> {
    if (!this.services.gicChat) return;
    let index = 1;
    let lastEventType: string | undefined;
    try {
      await this.services.gicChat.stream(
        request,
        async (event) => {
          lastEventType = (event as { type: string }).type;
          const isLast = lastEventType === "done" || lastEventType === "error";
          ctx.send(
            createMessage("stream", ns, action, "shell", ctx.moduleId, JSON.stringify(event), {
              id: ctx.requestId,
              traceId: ctx.traceId,
              streamIndex: index,
              streamLast: isLast,
            }),
            ctx.source,
          );
          index++;
          if (isLast) {
            // Host already sent last chunk; no extra empty last needed
          }
        },
        signal,
      );
      // If stream ended without done/error (e.g. no content), ensure last
      if (lastEventType !== "done" && lastEventType !== "error") {
        ctx.send(
          createMessage(
            "stream",
            ns,
            action,
            "shell",
            ctx.moduleId,
            JSON.stringify({ type: "done" }),
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
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Mid-stream error per spec is still 200 with error event, but if fetch itself fails, send error stream
      ctx.send(
        createMessage(
          "stream",
          ns,
          action,
          "shell",
          ctx.moduleId,
          JSON.stringify({ type: "error", detail }),
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
  }

  private matchesSubscription(eventType: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (pattern.endsWith("*")) {
      return eventType.startsWith(pattern.slice(0, -1));
    }
    return eventType === pattern;
  }

  // ---------------------------------------------------------------------------
  // Response helpers & guards
  // ---------------------------------------------------------------------------

  private okResponse(request: HostPlatformMessage, payload: unknown): HostPlatformMessage {
    return createMessage(
      "response",
      request.namespace,
      request.action,
      "shell",
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
      "response",
      request.namespace,
      request.action,
      "shell",
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
    if (this.allowedOrigins.includes("*")) return true;
    return this.allowedOrigins.some((allowed) => origin === allowed || origin.endsWith(allowed));
  }

  private isMethodAllowed(namespace: string, action: string, module: ConnectedModule): boolean {
    return isCapabilityGranted(module.capabilities, namespace, action);
  }

  private authorizeNavigation(moduleId: string, target: NavigationTarget): boolean {
    return Boolean(moduleId && target.app && target.route);
  }
}

export function createRpcServer(options: RpcServerOptions): RpcServer {
  return new RpcServer(options);
}

/**
 * Reads the single boolean `navigation.back` / `navigation.push` carry. The
 * SDK sends `{ consumed }`; a bare boolean and a missing payload are both
 * accepted so the handshake survives a hand-rolled caller.
 */
function readConsumed(payload: unknown): boolean {
  if (typeof payload === "boolean") return payload;
  if (payload && typeof payload === "object") {
    const { consumed } = payload as { consumed?: unknown };
    if (typeof consumed === "boolean") return consumed;
  }
  return true;
}
