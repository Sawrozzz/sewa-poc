import { useEffect, useState } from "react";
import type { Platform } from "./PlatformDetector";
import { getApplicationPlatform } from "./PlatformDetector";

export function useApplicationPlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("WEB");

  useEffect(() => {
    setPlatform(getApplicationPlatform());
  }, []);

  return platform;
}
