import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().optional(),
  NEXT_PUBLIC_API_BASE_URL: z.url().optional(),
  NEXT_PUBLIC_AUTH_API_URL: z.url().optional(),
  NEXT_PUBLIC_MAX_CACHED_MINI_APPS: z.coerce.number().int().positive().max(20).optional(),
  NEXT_PUBLIC_MANIFEST_PUBLIC_KEY: z.string().optional(),
  NEXT_PUBLIC_MANIFEST_SIGNATURE_REQUIRED: z.enum(["true", "false"]).optional(),
  NEXT_PUBLIC_BUNDLE_PROXY: z.enum(["on", "off"]).optional(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  SDK_CDN_URL: z.url().optional(),
  BETTER_AUTH_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.warn("[env] validation failed:", parsed.error.flatten().fieldErrors);
    cached = {} as Env;
    return cached;
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const env = getEnv();
  const val = env[key];
  if (!val) throw new Error(`Missing required env: ${String(key)}`);
  return val as NonNullable<Env[K]>;
}
