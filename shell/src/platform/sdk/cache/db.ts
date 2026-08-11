/**
 * IndexedDB implementation of `SdkStore`.
 *
 * Deliberately a different database from `sewa-plugin-cache`
 * (`packages/runtime-loader/src/cache.ts`): different lifecycle, different
 * eviction policy, and an SDK schema bump must not invalidate mini-app
 * bundles. Two real object stores are used rather than that cache's
 * `__cache-order__` magic-key trick.
 */

import type { CachedSdkBundle, SdkPointer, SdkStore } from "@/types/platform";

const DB_NAME = "sewa-sdk-cache";
const DB_VERSION = 1;

/** Bundle records, keyed by `name@version`. */
const BUNDLE_STORE = "bundles";

/** Single-row store holding the `active` pointer. */
const META_STORE = "meta";

const NAME_INDEX = "by-name";
const LAST_USED_INDEX = "by-lastUsedAt";

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IdbSdkStore implements SdkStore {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  /**
   * Opens (or upgrades) the database. Rejects when IndexedDB is missing
   * entirely — SSR, or a browser mode that removes it — which callers treat as
   * "cache unavailable" rather than an error worth surfacing.
   */
  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;

    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(BUNDLE_STORE)) {
          const store = db.createObjectStore(BUNDLE_STORE, { keyPath: "key" });
          store.createIndex(NAME_INDEX, "name", { unique: false });
          store.createIndex(LAST_USED_INDEX, "lastUsedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("[SdkCache] IndexedDB open failed:", req.error);
        reject(req.error ?? new Error("IndexedDB open failed"));
      };
      req.onblocked = () =>
        console.warn("[SdkCache] IndexedDB open blocked — another tab holds an old version");
    })
      .then((db) => {
        this.db = db;
        return db;
      })
      .catch((err) => {
        this.opening = null;
        throw err;
      });

    return this.opening;
  }

  async get(key: string): Promise<CachedSdkBundle | null> {
    const db = await this.open();
    const tx = db.transaction(BUNDLE_STORE, "readonly");
    const result = await promisify(tx.objectStore(BUNDLE_STORE).get(key));
    return (result as CachedSdkBundle | undefined) ?? null;
  }

  async put(bundle: CachedSdkBundle): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(BUNDLE_STORE, "readwrite");
    await promisify(tx.objectStore(BUNDLE_STORE).put(bundle));
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(BUNDLE_STORE, "readwrite");
    await promisify(tx.objectStore(BUNDLE_STORE).delete(key));
  }

  async listByName(name: string): Promise<CachedSdkBundle[]> {
    const db = await this.open();
    const tx = db.transaction(BUNDLE_STORE, "readonly");
    const index = tx.objectStore(BUNDLE_STORE).index(NAME_INDEX);
    const result = await promisify(index.getAll(IDBKeyRange.only(name)));
    return (result as CachedSdkBundle[]) ?? [];
  }

  /** Bumps `lastUsedAt` in one read-modify-write transaction. */
  async touch(key: string, at: number): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(BUNDLE_STORE, "readwrite");
    const store = tx.objectStore(BUNDLE_STORE);
    const existing = (await promisify(store.get(key))) as CachedSdkBundle | undefined;
    if (!existing) return;
    await promisify(store.put({ ...existing, lastUsedAt: at }));
  }

  async getActive(): Promise<SdkPointer | null> {
    const db = await this.open();
    const tx = db.transaction(META_STORE, "readonly");
    const result = await promisify(tx.objectStore(META_STORE).get("active"));
    return (result as SdkPointer | undefined) ?? null;
  }

  async setActive(pointer: SdkPointer): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(META_STORE, "readwrite");
    await promisify(tx.objectStore(META_STORE).put(pointer));
  }

  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([BUNDLE_STORE, META_STORE], "readwrite");
    tx.objectStore(BUNDLE_STORE).clear();
    tx.objectStore(META_STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.opening = null;
  }
}
