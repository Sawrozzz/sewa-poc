interface GovSdkInstance {
    readonly moduleId: string;
    readonly version: string;
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
    http: {
        get<T = unknown>(
            endpoint: string,
            query?: Record<string, string>,
            headers?: Record<string, string>
        ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
        post<T = unknown>(
            endpoint: string,
            body?: unknown,
            headers?: Record<string, string>
        ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
        put<T = unknown>(
            endpoint: string,
            body?: unknown,
            headers?: Record<string, string>
        ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
        patch<T = unknown>(
            endpoint: string,
            body?: unknown,
            headers?: Record<string, string>
        ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
        delete<T = unknown>(
            endpoint: string,
            headers?: Record<string, string>
        ): Promise<{ status: number; data: T; headers: Record<string, string> }>;
    };
    platform: {
        readonly type: 'WEB' | 'ANDROID' | 'IOS';
        isWeb(): boolean;
        isAndroid(): boolean;
        isIOS(): boolean;
        isMobile(): boolean;
    };
    destroy(): void;
}

interface GovSdkRegistry {
    createInstance(options: {
        moduleId: string;
        channel?: string;
        sdkOptions?: {
            timeout?: number;
            retryAttempts?: number;
            retryDelayMs?: number;
            targetOrigin?: string;
        };
    }): Promise<GovSdkInstance>;
    getInstance(moduleId: string): GovSdkInstance | null;
    /** Get the most recently created SDK instance — no moduleId needed. */
    getActiveInstance(): GovSdkInstance | null;
    destroyInstance(moduleId: string): void;
    hasInstance(moduleId: string): boolean;
    getActiveModuleIds(): string[];
}

interface Window {
    getMiniAppBridge(): GovSdkRegistry | undefined;
}
