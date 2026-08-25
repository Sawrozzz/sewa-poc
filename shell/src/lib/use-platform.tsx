import { useEffect, useState } from "react";

export type Platform = "Web" | "Android" | "IOS";

export function useApplicationPlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("Web");

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();

    const isIOS =
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS) {
      setPlatform("IOS");
      return;
    }

    if (/android/.test(ua)) {
      setPlatform("Android");
      return;
    }

    setPlatform("Web");
  }, []);

  return platform;
}
