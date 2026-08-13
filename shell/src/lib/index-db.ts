import type { SignedMiniAppManifest } from "@sewa/host-platform";
import type { IDBPDatabase } from "idb";
import { openDB } from "idb";

const DB_NAME = "all-data";
const DB_VERSION = 1;
const STORE_NAME = "mini-apps";

/** The store is keyed by `id`, and there is only ever one manifest record. */
const MANIFEST_ID = "signed-manifest";

/** A stored manifest, plus when it was written. */
export interface StoredManifestRecord {
  id: typeof MANIFEST_ID;
  manifest: SignedMiniAppManifest;
  /** Epoch ms the record was written — lets callers judge how stale it is */
  savedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Open (once) the shared app database.
 *
 * Opened lazily rather than at module scope because this module is imported by
 * client components that Next.js still evaluates on the server, where
 * `indexedDB` does not exist.
 *
 * @returns The open database, or null when there is no IndexedDB (SSR)
 */
function getDb(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === "undefined") return null;

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
  }

  return dbPromise;
}

/**
 * Persist the signed manifest returned by `/api/mini-apps`.
 *
 * Only ever called with a manifest whose signature already verified, so what
 * lands in IndexedDB is a document the shell has vouched for.
 *
 * Storage failures are swallowed: this is a convenience copy, and losing it
 * must not fail the request that produced it.
 *
 * @param manifest - The verified manifest, exactly as received
 */
export async function saveMiniAppsManifest(manifest: SignedMiniAppManifest): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const record: StoredManifestRecord = {
    id: MANIFEST_ID,
    manifest,
    savedAt: Date.now(),
  };

  try {
    await db.put(STORE_NAME, record);
  } catch (err) {
    console.warn("[index-db] Could not store the mini-app manifest:", err);
  }
}

/**
 * Read the last manifest stored by {@link saveMiniAppsManifest}.
 *
 * The record is returned as stored — signature included — so any caller that
 * acts on it can re-verify rather than trusting that it was verified once.
 *
 * @returns The stored record, or null when nothing has been stored yet
 */
export async function getStoredMiniAppsManifest(): Promise<StoredManifestRecord | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    return (await db.get(STORE_NAME, MANIFEST_ID)) ?? null;
  } catch (err) {
    console.warn("[index-db] Could not read the stored mini-app manifest:", err);
    return null;
  }
}

/**
 * Drop the stored manifest — e.g. on sign-out.
 */
export async function clearMiniAppsManifest(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.delete(STORE_NAME, MANIFEST_ID);
  } catch (err) {
    console.warn("[index-db] Could not clear the stored mini-app manifest:", err);
  }
}
