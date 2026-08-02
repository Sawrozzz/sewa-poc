'use client';

import { useOffline } from '@/lib/OfflineContext';
import { useState, useEffect } from 'react';

export function OfflineBanner() {
  const { isOffline } = useOffline();
  const [showBanner, setShowBanner] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOffline) {
      setShowBanner(true);
      setTimeout(() => setIsVisible(true), 100);
    } else {
      setIsVisible(false);
      setTimeout(() => setShowBanner(false), 300);
    }
  }, [isOffline]);

  if (!showBanner) return null;

  return (
    <div
      className={`fixed top-8 left-4 right-4 z-50 p-3 rounded-lg shadow-lg transform transition-all duration-300 ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'} ${isOffline ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{isOffline ? '🚫' : '⚠️'}</span>
          <div>
            <p className="font-medium text-sm">
              {isOffline ? 'You are offline' : 'Connection unstable'}
            </p>
            <p className="text-xs text-gray-600">
              {isOffline 
                ? 'Some features may not be available. Changes will sync when you reconnect.'
                : 'Trying to reconnect...'
              }
            </p>
          </div>
        </div>
        {!isOffline && (
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-1 bg-gov-500 text-gov-950 font-medium rounded hover:bg-gov-600 transition"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}