import { useEffect, useState } from "react";

export type Platform = "WEB" | "ANDROID" | "IOS";

export function useApplicationPlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("WEB");

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari legacy PWA detection
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    // Normal browser → always Web
    if (!isStandalone) {
      setPlatform("Web");
      return;
    }

    const ua = navigator.userAgent.toLowerCase();

    if (/android/.test(ua)) {
      setPlatform("Android");
      return;
    }

    const isIOS =
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS) {
      setPlatform("IOS");
      return;
    }

    if (/android/.test(ua)) {
      setPlatform("ANDROID");
      return;
    }

    setPlatform("WEB");
  }, []);

  return platform;
}
