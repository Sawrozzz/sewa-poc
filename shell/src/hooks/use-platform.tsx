import { useEffect, useState } from "react";
import type { Platform } from "@/lib/platform-detector";
import { getApplicationPlatform } from "@/lib/platform-detector";

export function useApplicationPlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("WEB");

  useEffect(() => {
    setPlatform(getApplicationPlatform());
  }, []);

  return platform;
}
