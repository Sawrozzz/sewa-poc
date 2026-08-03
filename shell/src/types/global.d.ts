import type {
    MiniAppSdkInterface,
    PlatformUser,
    DevicePermissionStatus,
    DeviceLocationResult,
    DeviceCameraResult,
    DeviceGalleryResult,
    DeviceFileResult,
    FileModule,
    NavigationTarget,
    NavigationState,
    HttpResult,
    StorageSdkModule,
    ApiSdkModule,
    HttpMethod,
    ApiResult,
} from '@lizuz/mini-app-types';

declare global {
    type GovSdkInstance = MiniAppSdkInterface;
    type SdkPlatformUser = PlatformUser;
    type SdkDevicePermissionStatus = DevicePermissionStatus;
    type SdkDeviceLocationResult = DeviceLocationResult;
    type SdkDeviceCameraResult = DeviceCameraResult;
    type SdkDeviceGalleryResult = DeviceGalleryResult;
    type SdkDeviceFileResult = DeviceFileResult;
    type SdkFileModule = FileModule;
    type SdkNavigationTarget = NavigationTarget;
    type SdkNavigationState = NavigationState;
    type SdkHttpResult<T = unknown> = HttpResult<T>;
    type SdkStorageModule = StorageSdkModule;
    type SdkApiModule = ApiSdkModule;
    type SdkHttpMethod = HttpMethod;
    type SdkApiResult<T = unknown> = ApiResult<T>;

    interface GovSdkRegistry {
        createInstance(options: {
            miniAppId: string;
            channel?: string;
            sdkOptions?: {
                timeout?: number;
                retryAttempts?: number;
                retryDelayMs?: number;
                targetOrigin?: string;
                registerGlobal?: boolean;
            };
        }): Promise<GovSdkInstance>;
        getInstance(miniAppId: string): GovSdkInstance | null;
        destroyInstance(miniAppId: string): void;
        hasInstance(miniAppId: string): boolean;
        getActiveModuleIds(): string[];
    }

    interface Window {
        getMiniAppBridge(): GovSdkRegistry | undefined;
    }
}

export {};
