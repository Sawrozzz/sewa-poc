'use client';

import { useState, useEffect } from 'react';

export function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isMobileDevice = /android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    const isIOSDevice = /iphone|ipad|ipod/i.test(userAgent.toLowerCase());
    
    setIsMobile(isMobileDevice);
    setIsIOS(isIOSDevice);
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  if (isStandalone || !isMobile) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-lg z-50">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-blue-900">Install App</h3>
          {isIOS ? (
            <p className="text-sm text-blue-700">
              Tap Share → "Add to Home Screen" to install
            </p>
          ) : (
            <p className="text-sm text-blue-700">
              Tap the install button to add to your home screen
            </p>
          )}
        </div>
        {!isIOS && (
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}