import "fake-indexeddb/auto";
import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PluginCacheDB } from "../src/cache";

function mockFetch() {
  return async () => {
    return new Response(JSON.stringify({ bundle: { entry: "index.js" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }) as unknown as Response;
  };
}

const manifest = { bundle: { entry: "index.js", files: ["index.js"] } } as never;

function dropDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("sewa-plugin-cache");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

async function storedKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("sewa-plugin-cache");
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("modules", "readonly");
      const keysReq = tx.objectStore("modules").getAllKeys();
      keysReq.onsuccess = () => {
        db.close();
        resolve(keysReq.result as string[]);
      };
      keysReq.onerror = () => {
        db.close();
        reject(keysReq.error);
      };
    };
    req.onerror = () => reject(req.error);
  });
}

let db: PluginCacheDB;

async function downloadAll() {
  await db.downloadDirectory("https://x/a", "app-a", {} as never, ["index.js"], manifest);
  await db.downloadDirectory("https://x/b", "app-b", {} as never, ["index.js"], manifest);
  await db.downloadDirectory("https://x/c", "app-c", {} as never, ["index.js"], manifest);
}

beforeEach(async () => {
  await dropDb();
  db = new PluginCacheDB(mockFetch(), 2);
});

afterEach(async () => {
  db.destroy();
  await dropDb();
});

describe("PluginCacheDB FIFO eviction", () => {
  it("removes the oldest module's assets from IndexedDB once the limit is exceeded", async () => {
    await downloadAll();

    const keys = await storedKeys();
    assert.strictEqual(
      keys.some((k) => k.startsWith("app-a/")),
      false,
      `oldest module (app-a) should be evicted, got: ${JSON.stringify(keys)}`,
    );
    assert.ok(
      keys.some((k) => k.startsWith("app-b/")),
      "app-b should remain",
    );
    assert.ok(
      keys.some((k) => k.startsWith("app-c/")),
      "app-c should remain",
    );
    assert.ok(keys.includes("__cache-order__"), "order record should persist");
  });

  it("evicts both excess modules when multiple are cached", async () => {
    await downloadAll();
    await db.downloadDirectory("https://x/d", "app-d", {} as never, ["index.js"], manifest);

    const keys = await storedKeys();
    assert.strictEqual(
      keys.some((k) => k.startsWith("app-a/")),
      false,
    );
    assert.strictEqual(
      keys.some((k) => k.startsWith("app-b/")),
      false,
    );
    assert.ok(
      keys.some((k) => k.startsWith("app-c/")),
      "app-c remains",
    );
    assert.ok(
      keys.some((k) => k.startsWith("app-d/")),
      "app-d remains",
    );
  });

  it("no longer resolves files for an evicted module", async () => {
    await downloadAll();

    assert.strictEqual(await db.hasDirectory("app-a"), false);
    assert.strictEqual(await db.getFile("app-a", "index.js"), null);
    assert.ok(await db.hasDirectory("app-b"));
    assert.strictEqual(await db.getFile("app-b", "index.js"), '{"bundle":{"entry":"index.js"}}');
  });

  it("persists order across instances so a fresh session keeps evicting the oldest", async () => {
    await downloadAll();

    // New page load / new instance — order is restored from `__cache-order__`.
    db.destroy();
    db = new PluginCacheDB(mockFetch(), 2);
    await db.downloadDirectory("https://x/d", "app-d", {} as never, ["index.js"], manifest);

    const keys = await storedKeys();
    assert.strictEqual(
      keys.some((k) => k.startsWith("app-b/")),
      false,
      "app-b evicted in the new session",
    );
    assert.ok(
      keys.some((k) => k.startsWith("app-c/")),
      "app-c remains",
    );
    assert.ok(
      keys.some((k) => k.startsWith("app-d/")),
      "app-d remains",
    );
  });

  it("moves a re-downloaded module to the back of the FIFO order", async () => {
    await downloadAll();
    // order: [app-b, app-c] (app-a was evicted)

    await db.downloadDirectory("https://x/b", "app-b", {} as never, ["index.js"], manifest);
    await db.downloadDirectory("https://x/d", "app-d", {} as never, ["index.js"], manifest);

    const keys = await storedKeys();
    assert.strictEqual(
      keys.some((k) => k.startsWith("app-c/")),
      false,
      "app-c (oldest) evicted",
    );
    assert.ok(
      keys.some((k) => k.startsWith("app-b/")),
      "re-downloaded app-b kept",
    );
    assert.ok(
      keys.some((k) => k.startsWith("app-d/")),
      "app-d kept",
    );
  });
});
