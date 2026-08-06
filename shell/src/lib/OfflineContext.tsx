'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

interface OfflineContextType {
  isOffline: boolean;
  wasOffline: boolean;
}

const OfflineContext = createContext<OfflineContextType>({
  isOffline: false,
  wasOffline: false,
});

function subscribeToOnlineState(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function getOnlineState() {
  return navigator.onLine;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [wasOffline, setWasOffline] = useState(false);

  const isOffline = !useSyncExternalStore(subscribeToOnlineState, getOnlineState, () => true);

  useEffect(() => {
    const handleOffline = () => {
      setWasOffline(true);
    };

    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <OfflineContext.Provider value={{ isOffline, wasOffline }}>{children}</OfflineContext.Provider>
  );
}

export const useOffline = () => useContext(OfflineContext);
