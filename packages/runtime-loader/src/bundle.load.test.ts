import "fake-indexeddb/auto";
import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PluginCacheDB } from "../src/cache";
import { RuntimeLoader } from "../src/loader";
import { unzip } from "../src/zip";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Build a ZIP archive so the reader is exercised against real bytes. */
async function makeZip(
  files: Record<string, Uint8Array | string>,
  { deflate = false }: { deflate?: boolean } = {},
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [path, content] of Object.entries(files)) {
    const raw = typeof content === "string" ? encoder.encode(content) : content;
    const payload = deflate ? await deflateRaw(raw) : raw;
    const name = encoder.encode(path);
    const method = deflate ? 8 : 0;

    const local = new Uint8Array(30 + name.length + payload.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc32(raw), true);
    localView.setUint32(18, payload.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(payload, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, crc32(raw), true);
    centralView.setUint32(20, payload.length, true);
    centralView.setUint32(24, raw.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, centrals.length, true);
  eocdView.setUint16(10, centrals.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, eocd];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const archive = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive;
}

async function sha256Prefixed(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256-${hex}`;
}

const BUNDLE_MANIFEST = JSON.stringify({
  schemaVersion: "1",
  bundle: {
    entry: "main-abc.js",
    styles: ["assets/main-abc.css"],
    files: ["assets/main-abc.css", "logo.png", "main-abc.js"],
  },
});

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function bundleFiles() {
  return {
    "manifest.json": BUNDLE_MANIFEST,
    "main-abc.js": 'export function mount(){}\nconst logo = "/logo.png";',
    "assets/main-abc.css": ".a{background:url(/logo.png)}",
    "logo.png": PNG_BYTES,
  };
}

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
let downloads: number;

/** Serves `archive` for every request and counts the hits. */
function archiveFetcher(archive: Uint8Array): typeof fetch {
  return (async () => {
    downloads++;
    return new Response(archive.slice() as unknown as BodyInit, { status: 200 });
  }) as unknown as typeof fetch;
}

function makeLoader(archive: Uint8Array): RuntimeLoader {
  const fetcher = archiveFetcher(archive);
  db = new PluginCacheDB(fetcher, 2);
  return new RuntimeLoader({ fetcher, db });
}

beforeEach(async () => {
  await dropDb();
  downloads = 0;
});

afterEach(async () => {
  db?.destroy();
  await dropDb();
});

describe("ZIP reader", () => {
  it("reads stored and deflated entries back byte-for-byte", async () => {
    for (const deflate of [false, true]) {
      const archive = await makeZip(bundleFiles(), { deflate });
      const entries = await unzip(archive);

      assert.deepStrictEqual(
        [...entries.keys()].sort(),
        ["assets/main-abc.css", "logo.png", "main-abc.js", "manifest.json"],
        `deflate=${deflate}`,
      );
      assert.deepStrictEqual(entries.get("logo.png"), PNG_BYTES, `deflate=${deflate}`);
      assert.strictEqual(
        new TextDecoder().decode(entries.get("manifest.json")),
        BUNDLE_MANIFEST,
        `deflate=${deflate}`,
      );
    }
  });

  it("rejects bytes that are not a ZIP archive", async () => {
    await assert.rejects(() => unzip(new TextEncoder().encode("not a zip at all")), /Not a ZIP/);
  });
});

describe("RuntimeLoader.loadBundle", () => {
  it("verifies, unpacks, and caches the archive without keeping the zip", async () => {
    const archive = await makeZip(bundleFiles(), { deflate: true });
    const loader = makeLoader(archive);

    // Evaluation of the entry needs a browser (blob: imports), so the load
    // itself fails here — what matters is the cache state it leaves behind.
    await loader.loadBundle("app", "https://cdn/app.zip", {
      bundleHash: await sha256Prefixed(archive),
      version: "1.0.0",
      retryAttempts: 0,
    });

    const keys = await storedKeys();
    assert.ok(keys.includes("app@bundle/main-abc.js"), "entry JS cached");
    assert.ok(keys.includes("app@bundle/assets/main-abc.css"), "stylesheet cached");
    assert.ok(keys.includes("app@bundle/logo.png"), "binary asset cached");
    assert.ok(keys.includes("app@bundle/manifest.json"), "bundle manifest cached");
    assert.ok(keys.includes("app@bundle/__bundleHash__"), "digest recorded");
    assert.strictEqual(
      keys.includes("app@bundle/__bundle.zip__"),
      false,
      "the archive itself must not survive extraction",
    );
    assert.strictEqual(
      keys.some((k) => k.startsWith("app/")),
      false,
      "the legacy cache namespace is left untouched",
    );

    const logo = await db.getBinary("app@bundle", "logo.png");
    assert.deepStrictEqual(new Uint8Array(logo?.bytes ?? new ArrayBuffer(0)), PNG_BYTES);
    assert.strictEqual(logo?.mimeType, "image/png");
    assert.strictEqual(await db.getVersion("app@bundle"), "1.0.0");
  });

  it("discards an archive whose digest does not match the manifest", async () => {
    const archive = await makeZip(bundleFiles());
    const loader = makeLoader(archive);

    const result = await loader.loadBundle("app", "https://cdn/app.zip", {
      bundleHash: `sha256-${"0".repeat(64)}`,
      retryAttempts: 0,
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? "", /hash mismatch/i);

    const keys = await storedKeys();
    assert.strictEqual(
      keys.some((k) => k.startsWith("app@bundle/")),
      false,
      "nothing from an unverified archive may reach the cache",
    );
  });

  it("skips the download entirely when the cached digest still matches", async () => {
    const archive = await makeZip(bundleFiles(), { deflate: true });
    const loader = makeLoader(archive);
    const bundleHash = await sha256Prefixed(archive);

    await loader.loadBundle("app", "https://cdn/app.zip", { bundleHash, retryAttempts: 0 });
    assert.strictEqual(downloads, 1);

    await loader.loadBundle("app", "https://cdn/app.zip", { bundleHash, retryAttempts: 0 });
    assert.strictEqual(downloads, 1, "a matching cached digest must not re-download");
  });

  it("re-downloads when the manifest advertises a new digest", async () => {
    const archive = await makeZip(bundleFiles(), { deflate: true });
    const loader = makeLoader(archive);

    await loader.loadBundle("app", "https://cdn/app.zip", {
      bundleHash: await sha256Prefixed(archive),
      retryAttempts: 0,
    });
    assert.strictEqual(downloads, 1);

    // A new release: same id, different digest — the cached copy is stale.
    await loader.loadBundle("app", "https://cdn/app.zip", {
      bundleHash: `sha256-${"1".repeat(64)}`,
      retryAttempts: 0,
    });
    assert.strictEqual(downloads, 2);
  });
});
