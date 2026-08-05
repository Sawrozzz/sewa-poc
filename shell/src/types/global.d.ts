import type { MiniAppSdkInterface } from '@lizuz/mini-app-types';

declare global {
    interface Window {
        __GSA_SDK__?: MiniAppSdkInterface;
    }
}

export {};
