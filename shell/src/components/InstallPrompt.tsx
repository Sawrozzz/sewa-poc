'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string; platform: string }>;
}

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || navigator.vendor || '';
}

function isMobileDevice() {
  return /android|iphone|ipod|blackberry|iemobile|opera mini/i.test(getUserAgent().toLowerCase());
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(getUserAgent().toLowerCase());
}

function isStandaloneMode() {
  return typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
}

export function InstallPrompt() {
  const isIOS = isIOSDevice();
  const isStandalone = isStandaloneMode();
  const isMobile = isMobileDevice();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
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

    await installPrompt.prompt();
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
              Tap Share → &#34;Add to Home Screen&#34; to install
            </p>
          ) : (
            <p className="text-sm text-gov-800">Tap to install this app to your home screen</p>
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
