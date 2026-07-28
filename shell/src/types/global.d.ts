interface ApiRequestParams<B = unknown> {
  method?: string;
  endpoint?: string;
  path: string;
  body?: B;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

interface ApiResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  error?: string;
}

interface GovSdkInstance {
  readonly miniAppId: string;
  readonly gsaProtocolVersion: string;
  readonly traceId: string;
  auth: {
    getUser(): Promise<{
      id: string;
      name: string;
      fullName?: string;
      email: string;
      nationalId?: string;
      roles: string[];
      permissions: string[];
      avatar?: string;
    } | null>;
    isAuthenticated(): Promise<boolean>;
    logout(): Promise<void>;
  };
  api: {
    request<T = unknown, B = unknown>(params: ApiRequestParams<B>): Promise<ApiResult<T>>;
  };
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  http: {
    get<T = unknown>(
      endpoint: string,
      query?: Record<string, string>,
      headers?: Record<string, string>,
    ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
    post<T = unknown>(
      endpoint: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
    put<T = unknown>(
      endpoint: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
    patch<T = unknown>(
      endpoint: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
    delete<T = unknown>(
      endpoint: string,
      headers?: Record<string, string>,
    ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
  };
  platform: {
    readonly type: 'WEB' | 'FLUTTER';
    isWeb(): boolean;
    isFlutter(): boolean;
    isMobile(): boolean;
  };
  destroy(): void;
}

interface GovSdkRegistry {
  createInstance(options: {
    miniAppId: string;
    channel?: string;
    sdkOptions?: {
      timeout?: number;
      retryAttempts?: number;
      retryDelayMs?: number;
      targetOrigin?: string;
      registerGlobal?: boolean;
    };
  }): Promise<GovSdkInstance>;
  getInstance(miniAppId: string): GovSdkInstance | null;
  destroyInstance(miniAppId: string): void;
  hasInstance(miniAppId: string): boolean;
  getActiveModuleIds(): string[];
}

interface Window {
  getMiniAppBridge(): GovSdkRegistry | undefined;
}
