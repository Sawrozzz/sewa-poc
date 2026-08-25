export type Platform = "WEB" | "ANDROID" | "IOS";

export function getApplicationPlatform(): Platform {
  if (typeof window === "undefined") {
    return "WEB";
  }

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (
      window.navigator as Navigator & {
        standalone?: boolean;
      }
    ).standalone === true;

  // Browser → always WEB
  if (!isStandalone) {
    return "WEB";
  }

  const ua = navigator.userAgent.toLowerCase();

  if (/android/.test(ua)) {
    return "ANDROID";
  }

  // Installed iOS PWA
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    return "IOS";
  }

  return "WEB";
}
