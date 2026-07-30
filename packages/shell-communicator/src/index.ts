import {
  type PlatformMessage,
  type PlatformError,
  type HandshakeResponsePayload,
  type NavigationTarget,
  type Transport,
  SDK_CAPABILITIES,
  COMMUNICATOR_VERSION,
  PROTOCOL_VERSION,
  SHELL_VERSION,
  createMessage,
  isPlatformMessage,
  PLATFORM_EVENTS,
  WindowEventTransport,
  type ShellServiceMap,
} from "@sewa/platform-contracts";
import { type EventBus } from "@sewa/event-bus";
import axios from "axios";

export interface ShellCommunicatorOptions {
  services: ShellServiceMap;
  eventBus: EventBus;
  transport?: Transport;
  allowedOrigins?: string[];
  onModuleConnected?: (moduleId: string) => void;
  onModuleDisconnected?: (moduleId: string) => void;
}

interface ConnectedModule {
  moduleId: string;
  sdkVersion: string;
  negotiatedVersion: string;
  capabilities: string[];
  connectedAt: number;
  origin: string;
  eventSubscriptions: Set<string>;
}

/**
 * Shell Communicator — the privileged gateway between Mini Apps and Shell internals.
 *
 * Mini Apps NEVER bypass this layer. All SDK calls are validated, traced, and routed here.
 */
interface ServiceEntry {
  moduleId: string;
  method: string;
}

export interface StreamChunk {
  data: Uint8Array | string;
  index: number;
  total?: number;
  last: boolean;
}

export class ShellCommunicator {
  private services: ShellServiceMap;
  private eventBus: EventBus;
  private transport: Transport;
  private allowedOrigins: string[];
  private modules = new Map<string, ConnectedModule>();
  private pendingRequests = new Map<
    string,
    {
      resolve: (msg: PlatformMessage) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private transportUnsub: (() => void) | null = null;
  private eventUnsubscribers: Array<() => void> = [];
  private _initialized = false;
  private onModuleConnected?: (moduleId: string) => void;
  private onModuleDisconnected?: (moduleId: string) => void;
  private serviceRegistry = new Map<string, ServiceEntry>();

  constructor(options: ShellCommunicatorOptions) {
    this.services = options.services;
    this.eventBus = options.eventBus;
    this.transport = options.transport ?? new WindowEventTransport();
    this.allowedOrigins = options.allowedOrigins ?? ["*"];
    this.onModuleConnected = options.onModuleConnected;
    this.onModuleDisconnected = options.onModuleDisconnected;
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;
    this.transportUnsub = this.transport.subscribe((msg:any, source:any) =>
      this.handleMessage(msg, source),
    );

    const unsub = this.eventBus.subscribe("navigation.route.changed", (evt) => {
      this.broadcastToModules(
        "shell",
        createMessage(
          "event",
          "navigation",
          "changed",
          "shell",
          "*",
          evt.payload,
          { traceId: evt.traceId },
        ),
      );
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
  }

  /** Handle incoming message from mini app via transport layer */
  private async handleMessage(
    msg: PlatformMessage,
    source?: Window | null,
  ): Promise<void> {
    if (!isPlatformMessage(msg)) {
      return;
    }

    const origin = source === window || !source ? window.location.origin : "*";
    if (!this.isOriginAllowed(origin)) {
      return;
    }

    try {
      if (msg.type === "handshake") {
        const response = await this.processHandshake(msg, origin);
        this.transport.send(response, source);
        return;
      }

      if (msg.type === "request") {
        const response = await this.routeRequest(msg, source);
        this.transport.send(response, source);
        return;
      }

      if (msg.type === "response") {
        const pending = this.pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(msg.requestId);
          pending.resolve(msg);
        }
      }
    } catch (err) {
      const error = this.createError(
        "COMMUNICATOR_ERROR",
        err instanceof Error ? err.message : String(err),
      );
      this.transport.send(
        createMessage(
          "response",
          msg.namespace,
          msg.action,
          "shell",
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
    msg: PlatformMessage,
    origin: string,
  ): Promise<PlatformMessage> {
    const payload = msg.payload as {
      miniAppId: string;
      sdkVersion: string;
      supportedMethods: string[];
     };
     const negotiatedVersion = this.negotiateVersion(payload.sdkVersion);

     const capabilities = [...SDK_CAPABILITIES];

     const module: ConnectedModule = {
       moduleId: payload.miniAppId,
       sdkVersion: payload.sdkVersion,
       negotiatedVersion,
       capabilities,
       connectedAt: Date.now(),
       origin,
       eventSubscriptions: new Set(),
     };

    this.modules.set(payload.miniAppId, module);
    this.onModuleConnected?.(payload.miniAppId);

    const responsePayload: HandshakeResponsePayload = {
      shellVersion: SHELL_VERSION,
      communicatorVersion: COMMUNICATOR_VERSION,
      negotiatedVersion,
      grantedCapabilities: module.capabilities,
      traceId: msg.traceId,
    };


    return createMessage(
      "response",
      "handshake",
      msg.action,
      "shell",
      payload.miniAppId,
      responsePayload,
      {
        id: msg.requestId,
        traceId: msg.traceId,
      },
    );
  }

   private async routeRequest(msg: PlatformMessage, source?: Window | null): Promise<PlatformMessage> {
     const module = this.modules.get(msg.source);
    if (!module && msg.namespace !== "handshake") {
      return this.errorResponse(
        msg,
        "MODULE_NOT_CONNECTED",
        "Module not connected. Call initialize() first.",
      );
    }

    if (!this.isMethodAllowed(msg.namespace, module)) {
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

    const payload = msg.payload as Record<string, unknown> | undefined;

    switch (`${msg.namespace}.${msg.action}`) {
      case "auth.getUser":
        return this.okResponse(msg, await this.services.auth.getUser());

      case "auth.isAuthenticated":
        return this.okResponse(msg, await this.services.auth.isAuthenticated());

      case "auth.logout":
        await this.services.auth.logout();
        await this.eventBus.emit(
          PLATFORM_EVENTS.AUTH_LOGOUT,
          msg.source,
          {},
          { traceId: msg.traceId },
        );
        return this.okResponse(msg, null);

        case "ai.chat": {
          const chatPayload = payload as {
           messages: { role: string; content: string; }[];
         };
         const chatPayloadOptions = (payload as { options?: Record<string, unknown> } | undefined)?.options;

         if (!chatPayload?.messages || chatPayload.messages.length === 0) {
           return this.errorResponse(msg, "INVALID_PARAMS", "Missing messages");
         }

        // Stream the chat response chunks back to the mini app as "stream" type
        const chatMessages = chatPayload.messages.map(m => ({ ...m, role: m.role as "user" | "system" | "ai" }));
        this._streamChatChunks(msg, this.services.chat.chat(chatMessages, chatPayloadOptions || {}), source).catch((err) => {
          this.transport.send(
            createMessage(
              "response",
              msg.namespace,
              msg.action,
              "shell",
              msg.source,
              undefined,
              {
                id: msg.requestId,
                traceId: msg.traceId,
                error: {
                  code: "CHAT_ERROR",
                  message: err instanceof Error ? err.message : String(err),
                },
              },
            ),
            source,
          );
        });

        return this.okResponse(msg, { streaming: true });
      }

      case "permissions.has":
        return this.okResponse(
          msg,
          this.services.permissions.has(payload?.permission as string),
        );

      case "permissions.list":
        return this.okResponse(msg, this.services.permissions.list());

      case "flags.isEnabled":
        return this.okResponse(
          msg,
          this.services.flags.isEnabled(payload?.flag as string, msg.source),
        );

      case "flags.getAll":
        return this.okResponse(msg, this.services.flags.getAll(msg.source));

      case "config.get":
        return this.okResponse(
          msg,
          this.services.config.get(payload?.key as string, msg.source),
        );

      case "config.getAll":
        return this.okResponse(msg, this.services.config.getAll(msg.source));

      case "navigation.navigate": {
        const target = payload as unknown as NavigationTarget;
        if (!this.authorizeNavigation(msg.source, target)) {
          return this.errorResponse(
            msg,
            "NAVIGATION_DENIED",
            "Navigation not authorized",
          );
        }
        await this.services.navigation.navigate(target);
        await this.eventBus.emit(
          PLATFORM_EVENTS.NAVIGATION_REQUEST,
          msg.source,
          target,
          { traceId: msg.traceId },
        );
        return this.okResponse(msg, null);
      }

      case "navigation.getCurrent":
        return this.okResponse(msg, this.services.navigation.getCurrent());


      case "platform.getType": {
        const info = await this.services.device.info();
        return this.okResponse(msg, info);
      }

      case "platform.isWeb":
        return this.okResponse(msg, false);

      case "platform.isAndroid":
        return this.okResponse(msg, false);

      case "platform.isIOS":
        return this.okResponse(msg, false);

      case "platform.isMobile":
        return this.okResponse(msg, false);

      case "device.location": {
        try {
          const result = await this.services.device.location(payload);
          return this.okResponse(msg, result);
        } catch (err) {
          return this.okResponse(msg, {
            status: "denied",
            error: err instanceof Error ? err.message : "Location access denied",
          });
        }
      }

      case "device.camera": {
        const result = await this.services.device.camera(payload);
        return this.okResponse(msg, result);
      }

      case "device.gallery": {
        const result = await this.services.device.gallery(payload);
        return this.okResponse(msg, result);
      }

      case "device.download": {
        const result = await this.services.device.download(payload);
        return this.okResponse(msg, result);
      }

      case "device.biometric": {
        const result = await this.services.device.biometric(payload);
        return this.okResponse(msg, result);
      }

      case "device.notifications": {
        const result = await this.services.device.notifications(payload);
        return this.okResponse(msg, result);
      }

      case "device.network": {
        const result = await this.services.device.network();
        return this.okResponse(msg, result);
      }

      case "device.storage": {
        const action = (payload as { action?: string })?.action ?? "";
        const key = (payload as { key?: string })?.key ?? "";
        const value = (payload as { value?: string })?.value ?? "";
        switch (action) {
          case "get":
            return this.okResponse(msg, await this.services.device.storage.get(key));
          case "set":
            await this.services.device.storage.set(key, value);
            return this.okResponse(msg, value);
          case "remove":
            await this.services.device.storage.remove(key);
            return this.okResponse(msg, null);
          default:
            return this.okResponse(msg, null);
        }
      }

      case "device.info": {
        const result = await this.services.device.info();
        return this.okResponse(msg, result);
      }

      case "http.get": {

        const httpPayload = payload as
          | {
              endpoint?: string;
              query?: Record<string, string>;
              headers?: Record<string, string>;
            }
          | undefined;
        if (!httpPayload?.endpoint) {
          return this.errorResponse(msg, "INVALID_PARAMS", "Missing endpoint");
        }
        try {
          const res = await axios.get(httpPayload.endpoint, {
            params: httpPayload.query,
            headers: httpPayload.headers,
          });
          const headers: Record<string, string> = {};
          if (res.headers) {
            Object.entries(res.headers).forEach(([k, v]) => {
              headers[k] = String(v);
            });
          }
          return this.okResponse(msg, {
            status: res.status,
            data: res.data,
            headers,
            url: res.config.url ?? httpPayload.endpoint,
            links: {
              requestUrl: res.config.url ?? httpPayload.endpoint,
              self: httpPayload.endpoint,
            },
          });
        } catch (err) {
          if (axios.isAxiosError(err) && err.response) {
            const headers: Record<string, string> = {};
            if (err.response.headers) {
              Object.entries(err.response.headers).forEach(([k, v]) => {
                headers[k] = String(v);
              });
            }
            return this.okResponse(msg, {
              status: err.response.status,
              data: err.response.data,
              headers,
              url: err.config?.url ?? httpPayload.endpoint,
              links: {
                requestUrl: err.config?.url ?? httpPayload.endpoint,
                self: httpPayload.endpoint,
              },
            });
          }
          return this.errorResponse(
            msg,
            "HTTP_ERROR",
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      case "http.post":
      case "http.put":
      case "http.patch":
      case "http.delete": {

        const httpPayload2 = payload as
          | {
              endpoint: string;
              body?: unknown;
              headers?: Record<string, string>;
            }
          | undefined;
        if (!httpPayload2?.endpoint) {
          return this.errorResponse(msg, "INVALID_PARAMS", "Missing endpoint");
        }
        const method = msg.action.replace("http.", "") as
          | "post"
          | "put"
          | "patch"
          | "delete";
        try {
          const res = await axios({
            method,
            url: httpPayload2.endpoint,
            data: method === "delete" ? undefined : httpPayload2.body,
            headers: httpPayload2.headers,
          });
          const headers: Record<string, string> = {};
          if (res.headers) {
            Object.entries(res.headers).forEach(([k, v]) => {
              headers[k] = String(v);
            });
          }
          return this.okResponse(msg, {
            status: res.status,
            data: res.data,
            headers,
            url: res.config.url ?? httpPayload2.endpoint,
            links: {
              requestUrl: res.config.url ?? httpPayload2.endpoint,
              self: httpPayload2.endpoint,
            },
          });
        } catch (err) {
          if (axios.isAxiosError(err) && err.response) {
            const headers: Record<string, string> = {};
            if (err.response.headers) {
              Object.entries(err.response.headers).forEach(([k, v]) => {
                headers[k] = String(v);
              });
            }
            return this.okResponse(msg, {
              status: err.response.status,
              data: err.response.data,
              headers,
              url: err.config?.url ?? httpPayload2.endpoint,
              links: {
                requestUrl: err.config?.url ?? httpPayload2.endpoint,
                self: httpPayload2.endpoint,
              },
            });
          }
          return this.errorResponse(
            msg,
            "HTTP_ERROR",
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      case "api.request": {
        const apiPayload = payload as { method: string; path: string; body?: unknown; headers?: Record<string, string> } | undefined;
        if (!apiPayload?.method || !apiPayload?.path) {
          return this.errorResponse(msg, "INVALID_PARAMS", "Missing method or path");
        }
        try {
          const res = await axios({
            method: apiPayload.method,
            url: apiPayload.path,
            data: apiPayload.body,
            headers: apiPayload.headers,
          });
          const headers: Record<string, string> = {};
          if (res.headers) {
            Object.entries(res.headers).forEach(([k, v]) => {
              headers[k] = String(v);
            });
          }
          return this.okResponse(msg, { status: res.status, data: res.data, headers });
        } catch (err) {
          if (axios.isAxiosError(err) && err.response) {
            const headers: Record<string, string> = {};
            if (err.response.headers) {
              Object.entries(err.response.headers).forEach(([k, v]) => {
                headers[k] = String(v);
              });
            }
            return this.okResponse(msg, { status: err.response.status, data: err.response.data, headers });
          }
          return this.errorResponse(msg, "API_ERROR", err instanceof Error ? err.message : String(err));
        }
      }

      case "storage.get": {
        const storageGetPayload = payload as { key: string };
        if (!storageGetPayload?.key) {
          return this.errorResponse(msg, "INVALID_PARAMS", "Missing key");
        }
        return this.okResponse(msg, await this.services.storage.get(storageGetPayload.key));
      }

      case "storage.set": {
        const storageSetPayload = payload as { key: string; value: string };
        if (!storageSetPayload?.key) {
          return this.errorResponse(msg, "INVALID_PARAMS", "Missing key");
        }
        await this.services.storage.set(storageSetPayload.key, storageSetPayload.value);
        return this.okResponse(msg, null);
      }

      case "storage.remove": {
        const storageRemovePayload = payload as { key: string };
        if (!storageRemovePayload?.key) {
          return this.errorResponse(msg, "INVALID_PARAMS", "Missing key");
        }
        await this.services.storage.remove(storageRemovePayload.key);
        return this.okResponse(msg, null);
      }

      case "event.subscribe": {
        const eventType = payload?.eventType as string;
        module?.eventSubscriptions.add(eventType);
        return this.okResponse(msg, null);
      }

      case "event.unsubscribe": {
        module?.eventSubscriptions.delete(payload?.eventType as string);
        return this.okResponse(msg, null);
      }

      case "event.emit": {
        const eventType = payload?.eventType as string;
        const eventPayload = payload?.payload;
        const [evtNs, evtAct] = eventType.includes(".")
          ? eventType.split(".")
          : [eventType, ""];
        this.broadcastToModules(
          msg.source,
          createMessage("event", evtNs, evtAct, msg.source, "*", eventPayload, {
            traceId: msg.traceId,
          }),
        );
        await this.eventBus.emit(eventType, msg.source, eventPayload, {
          traceId: msg.traceId,
        });
        return this.okResponse(msg, null);
      }

      case "sdk.invoke": {
        const invokeMethod = payload?.method as string;
        const invokePayload = payload?.payload;
        const serviceModule = this.findServiceModule(invokeMethod);
        if (!serviceModule) {
          return this.errorResponse(
            msg,
            "SERVICE_NOT_FOUND",
            `No service registered for: ${invokeMethod}`,
          );
        }
        const [invNs, invAct] = invokeMethod.includes(".")
          ? invokeMethod.split(".")
          : [invokeMethod, ""];
        const request = createMessage(
          "request",
          invNs,
          invAct,
          msg.source,
          serviceModule.moduleId,
          invokePayload,
          { traceId: msg.traceId },
        );
        return this.forwardToModule(request, serviceModule);
      }

      case "sdk.register": {
        const registerMethod = payload?.method as string;
        if (!module || !registerMethod) {
          return this.errorResponse(
            msg,
            "INVALID_PARAMS",
            "Invalid registration",
          );
        }
        const existing = this.serviceRegistry.get(registerMethod);
        if (existing && existing.moduleId !== msg.source) {
          return this.errorResponse(
            msg,
            "SERVICE_CONFLICT",
            `Service ${registerMethod} already registered by ${existing.moduleId}`,
          );
        }
        this.serviceRegistry.set(registerMethod, {
          moduleId: msg.source,
          method: registerMethod,
        });
        return this.okResponse(msg, null);
      }

      default:
        return this.errorResponse(
          msg,
          "UNKNOWN_METHOD",
          `Unknown: ${msg.namespace}.${msg.action}`,
        );
    }
  }

  private broadcastToModules(_source: string, message: PlatformMessage): void {
    this.transport.send(message);

    const msgKey = `${message.namespace}.${message.action}`;
    const iframes = document.querySelectorAll("iframe[data-module-id]");
    iframes.forEach((iframe) => {
      const moduleId = iframe.getAttribute("data-module-id");
      const module = moduleId ? this.modules.get(moduleId) : undefined;
      if (
        module &&
        (msgKey === "navigation.changed" ||
          module.eventSubscriptions.has(msgKey))
      ) {
        this.transport.send(
          message,
          (iframe as HTMLIFrameElement).contentWindow,
        );
      }
    });
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

  private okResponse(
    request: PlatformMessage,
    payload: unknown,
  ): PlatformMessage {
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
    request: PlatformMessage,
    code: string,
    message: string,
    retryable = false,
  ): PlatformMessage {
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

  private createError(code: string, message: string): PlatformError {
    return { code, message };
  }

  private isOriginAllowed(origin: string): boolean {
    if (this.allowedOrigins.includes("*")) return true;
    return this.allowedOrigins.some(
      (allowed) => origin === allowed || origin.endsWith(allowed),
    );
  }

   private isMethodAllowed(
     namespace: string,
     module?: ConnectedModule,
   ): boolean {
     if (!module) return false;
     return module.capabilities!.includes(
       namespace as (typeof SDK_CAPABILITIES)[number],
     );
   }

  private authorizeNavigation(
    moduleId: string,
    target: NavigationTarget,
  ): boolean {
    return Boolean(moduleId && target.app && target.route);
  }

  private negotiateVersion(sdkVersion: string): string {
    const [major] = sdkVersion.split(".");
    const [shellMajor] = PROTOCOL_VERSION.split(".");
    if (major === shellMajor) return PROTOCOL_VERSION;
    return `${shellMajor}.0.0`;
  }

  /** Find which module registered a given service method */
  private findServiceModule(method: string): ServiceEntry | undefined {
    return this.serviceRegistry.get(method);
  }

  /** Forward a request to a target module and return its response */
  private async forwardToModule(
    request: PlatformMessage,
    _target: ServiceEntry,
  ): Promise<PlatformMessage> {
    void _target;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.requestId);
        resolve(
          this.errorResponse(
            request,
            "FORWARD_TIMEOUT",
            `Service ${request.namespace}.${request.action} timed out`,
          ),
        );
      }, 30000);

      this.pendingRequests.set(request.requestId, {
        resolve: (msg: PlatformMessage) => {
          clearTimeout(timer);
          resolve(msg);
        },
        timer,
      });
      this.transport.send(request);
    });
  }

    /** Stream chat chunks from the chat service to the mini app */
   private async _streamChatChunks(
     msg: PlatformMessage,
     iter: AsyncIterable<string>,
     source?: Window | null,
   ): Promise<void> {
     let index = 1;

     for await (const chunk of iter) {
       const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);

        const streamMsg = createMessage(
          "stream",
          "ai",
          "chat",
          "shell",
          "*",
          text,
          {
            id: msg.requestId,
            traceId: msg.traceId,
            streamIndex: index,
            streamLast: false,
          },
        );
         this.transport.send(streamMsg, source);
       index++;
     }

      // Final signal
      const doneMsg = createMessage(
        "stream",
        "ai",
        "chat",
        "shell",
        "*",
        "",
        {
          id: msg.requestId,
          traceId: msg.traceId,
          streamIndex: index,
          streamLast: true,
        },
      );
      this.transport.send(doneMsg, source);
   }
}

export function createShellCommunicator(
  options: ShellCommunicatorOptions,
): ShellCommunicator {
  return new ShellCommunicator(options);
}

export type { ConnectedModule };
