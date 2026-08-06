import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bootstrapMiniAppSdk,
  destroySdkInstance,
  readSdkInstance,
  seedSdkConfig,
  SDK_GLOBAL_KEY,
  HOST_DESCRIPTOR_GLOBAL_KEY,
} from "./index";

function makeFakeWindow() {
  const w: Record<string, unknown> = {
    location: { origin: "https://host.test" },
  };
  return w as unknown as Window & typeof globalThis;
}

function makeFakeSdk(overrides: Record<string, unknown> = {}) {
  return {
    initialize: async () => {},
    destroy: () => {},
    ...overrides,
  };
}

test("seedSdkConfig writes MiniAppSdkOptions + host descriptor globals", () => {
  const w = makeFakeWindow();
  seedSdkConfig(w, "driving-license", { timeout: 1234 });

  const g = w as unknown as Record<string, unknown>;
  assert.deepEqual(g[SDK_GLOBAL_KEY], {
    miniAppId: "driving-license",
    timeout: 1234,
    retryAttempts: 5,
    retryDelayMs: 500,
    maxRetryDelayMs: 10000,
    targetOrigin: "https://host.test",
  });

  const descriptor = g[HOST_DESCRIPTOR_GLOBAL_KEY] as Record<string, unknown>;
  assert.equal(descriptor.type, "web");
  assert.ok(Array.isArray(descriptor.capabilities));
  assert.ok((descriptor.capabilities as string[]).includes("device"));
  assert.equal(typeof descriptor.sdkVersion, "string");
});

test("seedSdkConfig falls back to '*' origin when location is missing", () => {
  const w = {} as unknown as Window & typeof globalThis;
  seedSdkConfig(w, "license", {});
  const g = w as unknown as Record<string, unknown>;
  assert.equal(
    (g[SDK_GLOBAL_KEY] as { targetOrigin: string }).targetOrigin,
    "*",
  );
});

test("readSdkInstance ignores a seeded config object", () => {
  const w = makeFakeWindow();
  seedSdkConfig(w, "license", {});
  assert.equal(readSdkInstance(w), null);
});

test("readSdkInstance returns the live instance", () => {
  const w = makeFakeWindow();
  const sdk = makeFakeSdk();
  (w as unknown as Record<string, unknown>)[SDK_GLOBAL_KEY] = sdk;
  assert.equal(readSdkInstance(w), sdk);
});

test("bootstrap reuses an existing instance without loading any script", async () => {
  const w = makeFakeWindow();
  let scriptLoads = 0;
  const sdk = makeFakeSdk();
  (w as unknown as Record<string, unknown>)[SDK_GLOBAL_KEY] = sdk;

  const env = {
    window: w,
    loadScript: async () => {
      scriptLoads += 1;
    },
    now: () => 1000,
  };

  const result = await bootstrapMiniAppSdk("license", {}, env);
  assert.equal(result.sdk, sdk);
  assert.equal(result.source, "existing");
  assert.equal(scriptLoads, 0);
});

test("bootstrap seeds the config and loads the configured source", async () => {
  const w = makeFakeWindow();
  const sdk = makeFakeSdk();
  let loadedSource = "";
  const seenConfig: unknown[] = [];

  const env = {
    window: w,
    loadScript: async (source: string) => {
      loadedSource = source;
      seenConfig.push((w as unknown as Record<string, unknown>)[SDK_GLOBAL_KEY]);
      (w as unknown as Record<string, unknown>)[SDK_GLOBAL_KEY] = sdk;
    },
    now: () => 1000,
  };

  const result = await bootstrapMiniAppSdk(
    "license",
    { source: "good.js" },
    env,
  );
  assert.equal(result.sdk, sdk);
  assert.equal(result.source, "good.js");
  assert.equal(loadedSource, "good.js");
  assert.equal(seenConfig.length, 1);
});

test("bootstrap throws when the source loads without producing an instance", async () => {
  const w = makeFakeWindow();
  const env = {
    window: w,
    loadScript: async () => {},
    now: () => 1000,
  };

  await assert.rejects(
    bootstrapMiniAppSdk("license", {}, env),
    /Mini App SDK did not initialize from \/sdk\/sewa-sdk\.min\.js/,
  );
});

test("bootstrap propagates load errors from the script", async () => {
  const w = makeFakeWindow();
  const env = {
    window: w,
    loadScript: async () => {
      throw new Error("404");
    },
    now: () => 1000,
  };

  await assert.rejects(
    bootstrapMiniAppSdk("license", {}, env),
    /404/,
  );
});

test("bootstrap reports the handshake duration", async () => {
  let now = 100;
  const w = makeFakeWindow();
  const sdk = makeFakeSdk({
    initialize: async () => {
      now += 25;
    },
  });
  (w as unknown as Record<string, unknown>)[SDK_GLOBAL_KEY] = sdk;

  const result = await bootstrapMiniAppSdk("license", {}, {
    window: w,
    loadScript: async () => {},
    now: () => now,
  });

  assert.equal(result.initTimeMs, 25);
});

test("destroySdkInstance calls destroy() on the live instance", () => {
  const w = makeFakeWindow();
  const g = w as unknown as Record<string, unknown>;
  let destroyed = 0;
  const sdk = makeFakeSdk({
    // The real MiniAppSdk.destroy() removes itself from the global.
    destroy: () => {
      destroyed += 1;
      if (g[SDK_GLOBAL_KEY] === sdk) delete g[SDK_GLOBAL_KEY];
    },
  });
  g[SDK_GLOBAL_KEY] = sdk;

  destroySdkInstance(w);
  destroySdkInstance(w);
  assert.equal(destroyed, 1);
});
