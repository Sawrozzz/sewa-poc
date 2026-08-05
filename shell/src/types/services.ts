import type { PlatformUser } from "@sewa/host-platform";

export interface PlatformServicesConfig {
    getUser: () => PlatformUser | null;
    getAccessToken: () => string | null;
    logout: () => Promise<void>;
    navigate: (path: string) => void;
}

export interface LocalApiRequestParams {
    method?: string;
    endpoint?: string;
    path?: string;
    body?: unknown;
    headers?: Record<string, string>;
}

export interface LocalApiResult<T = unknown> {
    status: number;
    data: T;
    headers: Record<string, string>;
    error?: string;
}
