"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { privileged } from "@/platform/host-privileges";

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getAppRefreshedFlag() {
  return privileged.sessionStorage?.getItem("app-refreshed") === "true";
}

const deleteIndexedDBs = (databaseNames: string[]) => {
  return Promise.all(
    databaseNames.map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);

          request.onsuccess = () => {
            resolve();
          };

          request.onerror = () => {
            console.error(`Failed to delete IndexedDB: ${name}`);
            resolve();
          };

          request.onblocked = () => {
            console.warn(`Deletion blocked for IndexedDB: ${name}`);
            resolve();
          };
        }),
    ),
  );
};

/**
 * Hard-resets the client: drops the mini-app bundle cache, clears the
 * onboarding flag and reloads. Lives here rather than in the header because the
 * mobile menu offers the same action, and a second copy of this sequence would
 * be a second chance to forget one of its steps.
 */
export function useAppRefresh() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const wasRefreshed = useSyncExternalStore(subscribeToStorage, getAppRefreshedFlag, () => false);
  const showSuccess = wasRefreshed && !dismissed;

  const refresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);

    const databaseNames = ["sewa-plugin-cache", "sewa-sdk-cache", "all-data"];

    const finish = () => {
      privileged.sessionStorage?.setItem("app-refreshed", "true");
      privileged.localStorage?.removeItem("sewa.onboarding.completed");

      router.replace("/");

      setTimeout(() => {
        window.location.reload();
      }, 500);
    };

    try {
      await deleteIndexedDBs(databaseNames);
    } finally {
      finish();
    }
  }, [isRefreshing, router]);

  useEffect(() => {
    if (!showSuccess) return;

    privileged.sessionStorage?.removeItem("app-refreshed");

    const timer = setTimeout(() => {
      setDismissed(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [showSuccess]);

  return { isRefreshing, showSuccess, refresh };
}
