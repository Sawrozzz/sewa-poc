'use client';

import { useState, useEffect } from 'react';

export function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isMobileDevice = /android|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    const isIOSDevice = /iphone|ipad|ipod/i.test(userAgent.toLowerCase());
    
    setIsMobile(isMobileDevice);
    setIsIOS(isIOSDevice);
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setShowCustomPrompt(true);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setShowCustomPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    
    const result = await installPrompt.prompt();
    setInstallPrompt(null);
    setShowCustomPrompt(false);
  };

  if (isStandalone || !isMobile || !showCustomPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-gov-50 border border-gov-200 rounded-lg p-4 shadow-lg z-50">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gov-900">Install App</h3>
          {isIOS ? (
            <p className="text-sm text-gov-800">
              Tap Share → "Add to Home Screen" to install
            </p>
          ) : (
            <p className="text-sm text-gov-800">
              Tap to install this app to your home screen
            </p>
          )}
        </div>
        <button
          onClick={handleInstallClick}
          className="bg-gov-500 text-gov-950 font-medium px-4 py-2 rounded-lg text-sm hover:bg-gov-600 transition"
        >
          {isIOS ? 'Instructions' : 'Install'}
        </button>
      </div>
    </div>
  );
}