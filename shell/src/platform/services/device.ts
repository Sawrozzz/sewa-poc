import type {
  DeviceBiometricResult,
  DeviceCameraResult,
  DeviceContactResult,
  DeviceDownloadResult,
  DeviceFilesResult,
  DeviceGalleryResult,
  DeviceInfoResult,
  DeviceLocationResult,
  DeviceNetworkResult,
  DeviceNotificationResult,
  DevicePermissionResponse,
  DownloadOptions,
  FileModule,
  FileOptions,
  PlatformUser,
} from "@sewa/host-platform";
import { privileged } from "../host-privileges";
import { isInstalledPwa, verifyFingerprint } from "./biometric";
import { ensureConsent, showNotice } from "./consent";
import { contactPicker } from "./contact-picker";
import { filePicker, getFallbackMimeType } from "./file-picker";

interface FileSystemWritableFileStreamLike {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable: () => Promise<FileSystemWritableFileStreamLike>;
}

interface WindowWithSaveFilePicker extends Window {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<FileSystemFileHandleLike>;
}

export function createDeviceService(getUser: () => PlatformUser | null) {
  const device = {
    location: async (_options?: { highAccuracy?: boolean; timeout?: number; reason?: string }) => {
      try {
        if (!(await ensureConsent(_options?.reason, "Location Access"))) {
          return {
            status: "denied",
            data: null,
            error: "User declined location access",
          } as unknown as DevicePermissionResponse<DeviceLocationResult>;
        }
        if (!privileged.geolocation) throw new Error("Geolocation not supported");
        const result = await new Promise<DevicePermissionResponse<DeviceLocationResult>>(
          (resolve, reject) => {
            privileged.geolocation?.getCurrentPosition(
              (pos) =>
                resolve({
                  status: "granted",
                  data: {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    timestamp: new Date(pos.timestamp).toISOString(),
                  },
                } as DevicePermissionResponse<DeviceLocationResult>),
              (err) => reject(err),
              {
                enableHighAccuracy: _options?.highAccuracy ?? false,
                timeout: _options?.timeout ?? 10000,
              },
            );
          },
        );
        return result;
      } catch (err) {
        return {
          status: "denied",
          data: null,
          error: err instanceof Error ? err.message : "Location access denied",
        } as unknown as DevicePermissionResponse<DeviceLocationResult>;
      }
    },
    camera: async (options?: { facing?: "front" | "back"; reason?: string }) => {
      try {
        if (!(await ensureConsent(options?.reason, "Camera Access"))) {
          return {
            status: "denied",
            data: null,
            error: "User declined camera access",
          } as unknown as DevicePermissionResponse<DeviceCameraResult>;
        }
        const file = await new Promise<File>((resolve, reject) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          // On mobile (web or installed PWA) this opens the native camera
          // directly; desktop browsers ignore it and show a file picker.
          input.capture = options?.facing === "front" ? "user" : "environment";

          input.onchange = () => {
            if (!input.files || input.files.length === 0) {
              return reject(new Error("No photo captured"));
            }
            resolve(input.files[0]);
          };

          window.addEventListener(
            "focus",
            () => {
              setTimeout(() => {
                if (!input.files || input.files.length === 0) {
                  reject(new Error("Camera capture cancelled"));
                }
              }, 300);
            },
            { once: true },
          );
          input.click();
        });

        const blobUrl = URL.createObjectURL(file);
        return {
          status: "granted",
          data: {
            url: blobUrl,
            fileName: file.name,
            mimeType: file.type || "image/jpeg",
            byteSize: file.size,
          },
        } as DevicePermissionResponse<DeviceCameraResult>;
      } catch (error) {
        return {
          status: "denied",
          data: null,
          error: error instanceof Error ? error.message : "Camera capture cancelled",
        } as unknown as DevicePermissionResponse<DeviceCameraResult>;
      }
    },

    gallery: async (options?: FileOptions) => {
      try {
        if (!(await ensureConsent(options?.reason, "Photo Access"))) {
          return {
            status: "denied",
            error: "User declined photo access",
          } as unknown as DevicePermissionResponse<DeviceGalleryResult>;
        }
        const files = await filePicker({
          multiple: options?.multiple,
          accept: ["image/*", ".png", ".jpg", ".jpeg", ".webp", ".heic"],
        });

        return {
          status: "granted",
          data: {
            images: files,
          },
        } as unknown as DevicePermissionResponse<DeviceGalleryResult>;
      } catch (error) {
        return {
          status: "denied",
          error: error instanceof Error ? error.message : "Gallery selection cancelled",
        } as unknown as DevicePermissionResponse<DeviceGalleryResult>;
      }
    },
    files: async (options?: FileOptions) => {
      try {
        if (!(await ensureConsent(options?.reason, "File Access"))) {
          return {
            status: "denied",
            error: "User declined file access",
          } as unknown as DevicePermissionResponse<DeviceFilesResult>;
        }
        const files = await filePicker({
          multiple: options?.multiple,
          accept: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv"],
        });

        return {
          status: "granted",
          data: {
            files: files,
          },
        } as unknown as DevicePermissionResponse<DeviceFilesResult>;
      } catch (error) {
        return {
          status: "denied",
          error: error instanceof Error ? error.message : "File selection cancelled",
        } as unknown as DevicePermissionResponse<DeviceFilesResult>;
      }
    },
    download: async (options?: DownloadOptions) => {
      try {
        if (!options?.url || !options?.fileName) {
          throw new Error("url and fileName are required");
        }

        if (!(await ensureConsent(options.reason, "Download File", "Download"))) {
          return {
            status: "denied",
            error: "User declined the download",
          } as unknown as DevicePermissionResponse<DeviceDownloadResult>;
        }

        // Pick the destination *before* fetching: the save picker needs the
        // user activation from the tap above (which expires a few seconds after
        // an await), and cancelling here should skip the transfer entirely.
        let handle: FileSystemFileHandleLike | null = null;
        const saveWindow = window as WindowWithSaveFilePicker;
        if (typeof saveWindow.showSaveFilePicker === "function") {
          try {
            handle = await saveWindow.showSaveFilePicker({
              suggestedName: options.fileName,
            });
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              return {
                status: "denied",
                error: "Download cancelled",
              } as unknown as DevicePermissionResponse<DeviceDownloadResult>;
            }
            throw err;
          }
        }

        const resp = await fetch(options.url);
        if (!resp.ok) throw new Error(`Failed to fetch file: ${resp.status}`);

        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);

        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          // No File System Access API. The browser's download manager takes
          // over and reports nothing back, so `saved` stays false.
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = options.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }

        const ext = options.fileName.split(".").pop()?.toLowerCase() || "";
        const fileModule: FileModule = {
          url: blobUrl,
          previewUrl: blobUrl,
          fileName: options.fileName,
          mimeType: options.mimeType || blob.type || getFallbackMimeType(ext),
          extension: ext,
          byteSize: blob.size,
        };

        return {
          status: "granted",
          data: {
            file: fileModule,
            saved: handle !== null,
          },
        } as unknown as DevicePermissionResponse<DeviceDownloadResult>;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Download failed";
        const isCancelled =
          (error instanceof Error && error.name === "AbortError") ||
          message.toLowerCase().includes("abort") ||
          message.toLowerCase().includes("cancelled") ||
          message.toLowerCase().includes("canceled");
        return {
          status: "denied",
          error: isCancelled ? "Download cancelled" : message,
        } as unknown as DevicePermissionResponse<DeviceDownloadResult>;
      }
    },
    contact: async (options?: { reason?: string }) => {
      try {
        if (!(await ensureConsent(options?.reason, "Contact Access", "Share"))) {
          return {
            status: "denied",
            data: null,
            error: "User declined contact access",
          } as unknown as DevicePermissionResponse<DeviceContactResult>;
        }

        const picked = await contactPicker();
        if (!picked) {
          return {
            status: "denied",
            data: null,
            error: "Contact selection cancelled",
          } as unknown as DevicePermissionResponse<DeviceContactResult>;
        }

        return {
          status: "granted",
          data: {
            contactName: picked.contactName,
            number: picked.number,
          },
        } as unknown as DevicePermissionResponse<DeviceContactResult>;
      } catch (error) {
        return {
          status: "denied",
          data: null,
          error: error instanceof Error ? error.message : "Contact selection cancelled",
        } as unknown as DevicePermissionResponse<DeviceContactResult>;
      }
    },
    biometric: async (options?: {
      reason?: string;
    }): Promise<DevicePermissionResponse<DeviceBiometricResult>> => {
      // A browser tab can technically run WebAuthn, but the platform sensor is
      // only wired up for the installed app in this build — say so rather than
      // dropping the user into a prompt that goes nowhere.
      if (!isInstalledPwa()) {
        await showNotice(
          "Not available in the browser",
          "Fingerprint unlock only works in the installed Sewa app. Add Sewa to your home screen and try again.",
        );
        return {
          status: "denied",
          data: { success: false },
          error: "Biometric unlock requires the installed Sewa app",
        };
      }

      if (!(await ensureConsent(options?.reason, "Fingerprint Unlock", "Continue"))) {
        return { status: "denied", data: { success: false } };
      }

      try {
        const outcome = await verifyFingerprint(getUser());
        if (outcome === "not-fingerprint") {
          await showNotice(
            "Fingerprint required",
            "This device verified you with a PIN or password instead of a fingerprint. Add a fingerprint in your device settings and try again.",
          );
        }
        return { status: "granted", data: { success: outcome === "verified" } };
      } catch (error) {
        // NotAllowedError covers both "user cancelled" and "no matching
        // credential on this device" — neither is recoverable here, and the
        // contract carries no error channel, so both land on success: false.
        return { status: "denied", data: { success: false } };
      }
    },
    notifications: async (_options?: { requestPermission?: boolean; reason?: string }) =>
      ({ status: "granted", data: { granted: false } }) as unknown as DeviceNotificationResult,
    network: async () =>
      ({
        status: "granted",
        data: {
          online: navigator.onLine,
          type: navigator.onLine ? "unknown" : "none",
        },
      }) as unknown as DeviceNetworkResult,
    info: async () => {
      const ua = navigator.userAgent;
      const isMobile = /Mobi|Android/i.test(ua);
      return {
        status: "granted",
        data: {
          platform: isMobile ? (ua.includes("iPhone") ? "IOS" : "ANDROID") : "WEB",
          osVersion: "",
          appVersion: "1",
          deviceModel: ua,
          locale: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      } as unknown as DeviceInfoResult;
    },
  };

  return device;
}
