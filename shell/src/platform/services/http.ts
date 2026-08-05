import type { ShellStorageService } from "@sewa/host-platform";

export function createStorageService(): { storage: ShellStorageService } {
  const storage: ShellStorageService = {
    get: async (key: string) => {
      try {
        const res = await fetch(`/api/storage/${key}`);
        const data = (await res.json()) as { value?: string } | null;
        return data?.value ?? null;
      } catch {
        return null;
      }
    },
    set: async (key: string, value: string) => {
      await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
    },
    remove: async (key: string) => {
      await fetch(`/api/storage/${key}`, { method: "DELETE" });
    },
  };

  return { storage };
}
