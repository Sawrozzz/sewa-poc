import type { HttpResult, ShellApiService, ShellStorageService } from "@sewa/host-platform";
import type { LocalApiRequestParams, LocalApiResult } from "@/types/platform";

export function createHttpService() {
  const http = {
    get: async <T = unknown>(endpoint?: string, query?: Record<string, string>) => {
      try {
        const params = query ? new URLSearchParams(query).toString() : "";
        const res = await fetch(params ? `${endpoint ?? "/api"}?${params}` : (endpoint ?? "/api"));
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP GET failed",
        } as unknown as HttpResult<T>;
      }
    },
    post: async <T = unknown>(
      endpoint?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP POST failed",
        } as unknown as HttpResult<T>;
      }
    },
    put: async <T = unknown>(
      endpoint?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP PUT failed",
        } as unknown as HttpResult<T>;
      }
    },
    patch: async <T = unknown>(
      endpoint?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP PATCH failed",
        } as unknown as HttpResult<T>;
      }
    },
    delete: async <T = unknown>(endpoint?: string, headers?: Record<string, string>) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "DELETE",
          headers,
        });
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP DELETE failed",
        } as unknown as HttpResult<T>;
      }
    },
  };

  const api: ShellApiService = {
    request: async <T = unknown>(params: LocalApiRequestParams) => {
      try {
        const res = await fetch(
          params.endpoint?.startsWith("http") || params.endpoint?.startsWith("/")
            ? params.endpoint
            : `https://api.example.com${params.endpoint}`,
          {
            method: params.method?.toUpperCase() || "POST",
            headers: {
              "Content-Type": "application/json",
              ...params.headers,
            },
            body: params.body ? JSON.stringify(params.body) : undefined,
          },
        );
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: { ...res.headers },
        } as unknown as LocalApiResult<T>;
      } catch (err) {
        const error = err instanceof Error ? err.message : "API request failed";
        return {
          status: 0,
          data: null as T,
          headers: {},
          error,
        } as unknown as LocalApiResult<T>;
      }
    },
  };

  const storage: ShellStorageService = {
    get: async (key: string) => {
      try {
        const result = await http.get<{ value?: string } | null>(`/api/storage/${key}`);
        return result.data?.value ?? null;
      } catch {
        return null;
      }
    },
    set: async (key: string, value: string, options?: { ttlMs?: number }) => {
      await http.post("/api/storage", { key, value, ttlMs: options?.ttlMs });
      // TTL is best-effort: host may honor it server-side; web fallback stores without expiry
      if (options?.ttlMs && typeof window !== "undefined") {
        try {
          // For local fallback, schedule expiry via setTimeout not needed for this shell's remote storage
        } catch {}
      }
    },
    remove: async (key: string) => {
      await http.delete(`/api/storage/${key}`);
    },
  };

  return { http, api, storage };
}
