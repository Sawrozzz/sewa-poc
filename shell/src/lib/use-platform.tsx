import { useEffect, useState } from "react";

export type Platform = "IOS" | "Android" | "Web";

export function useApplicationPlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("Web");

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

    setPlatform("Web");
  }, []);

  return platform;
}
