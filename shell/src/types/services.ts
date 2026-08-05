import type { PlatformUser } from "@sewa/host-platform";

export interface PlatformServicesConfig {
    getUser: () => PlatformUser | null;
    getAccessToken: () => string | null;
    logout: () => Promise<void>;
    navigate: (path: string) => void;
}
