import type {
  PlatformUser,
  NavigationTarget,
  NavigationState,
  ChatMessage,
  DeviceLocationResult,
  BiometricMethod,
  DeviceBiometricResult,
  DeviceCameraResult,
  DeviceContactResult,
  DeviceGalleryResult,
  DeviceFilesResult,
  DeviceDownloadResult,
  DownloadOptions,
  DevicePermissionResponse,
  FileModule,
  FileOptions,
  HttpResult,
  ShellApiService,
  ShellStorageService,
  ShellAppearanceService,
} from "@sewa/host-platform";
import { privileged } from "./host-privileges";
import type { AppearanceController } from "./appearance-controller";

interface LocalApiRequestParams {
  method?: string;
  endpoint?: string;
  path?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

interface LocalApiResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  error?: string;
}

export interface PlatformServicesConfig {
  getUser: () => PlatformUser | null;
  getAccessToken: () => string | null;
  logout: () => Promise<void>;
  navigate: (path: string) => void;
}

export function filePicker(options?: FileOptions): Promise<FileModule[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options?.multiple ?? false;

    if (options?.accept?.length) {
      input.accept = options.accept.join(",");
    }
    input.onchange = () => {
      if (!input.files || input.files.length === 0) {
        return reject(new Error("No files selected"));
      }
      const results: FileModule[] = Array.from(input.files).map((file) => {
        const extension = file.name.split(".").pop()?.toLowerCase() || "";

        const blobUrl = URL.createObjectURL(file);

        return {
          url: blobUrl,
          previewUrl: blobUrl,
          fileName: file.name,
          mimeType: file.type || getFallbackMimeType(extension),
          extension: extension,
          byteSize: file.size,
        };
      });

      resolve(results);
    };

    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            reject(new Error("File picker closed."));
          }
        }, 300);
      },
      { once: true },
    );
    input.click();
  });
}
function requestConsent(params: {
  title: string;
  reason: string;
  allowLabel?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = [
      // Tailwind's preflight zeroes the UA stylesheet's `margin: auto` on
      // dialog, so centering has to be restated here.
      "position: fixed",
      "inset: 0",
      "margin: auto",
      "border: none",
      "border-radius: 16px",
      "padding: 24px 20px",
      "max-width: 320px",
      "width: calc(100vw - 48px)",
      "max-height: calc(100dvh - 48px)",
      "background: #fff",
      "box-shadow: 0 8px 32px rgba(0,0,0,0.25)",
      "font-family: inherit",
    ].join(";");

    const title = document.createElement("h2");
    title.textContent = params.title;
    title.style.cssText = "margin: 0 0 8px; font-size: 17px; font-weight: 600;";

    const message = document.createElement("p");
    message.textContent = params.reason;
    message.style.cssText =
      "margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: #555;";

    const actions = document.createElement("div");
    actions.style.cssText = "display: flex; gap: 12px; justify-content: flex-end;";

    const buttonBase =
      "font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 10px; border: none; cursor: pointer;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `${buttonBase} background: #f0f0f0; color: #333;`;

    const allowBtn = document.createElement("button");
    allowBtn.textContent = params.allowLabel ?? "Allow";
    allowBtn.style.cssText = `${buttonBase} background: #0b57d0; color: #fff;`;

    const close = (result: boolean) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    cancelBtn.onclick = () => close(false);
    allowBtn.onclick = () => close(true);
    // Esc key / back gesture
    dialog.oncancel = (e) => {
      e.preventDefault();
      close(false);
    };

    actions.append(cancelBtn, allowBtn);
    dialog.append(title, message, actions);
    document.body.appendChild(dialog);
    dialog.showModal();
    allowBtn.focus();
  });
}

/** Resolves true when the mini-app gave no reason (nothing to prime) or the user allowed. */
function ensureConsent(
  reason: string | undefined,
  title: string,
  allowLabel?: string,
): Promise<boolean> {
  if (!reason) return Promise.resolve(true);
  return requestConsent({ title, reason, allowLabel });
}

/** Single-button variant of requestConsent — nothing to decide, just to read. */
function showNotice(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = [
      // Same centering caveat as requestConsent().
      "position: fixed",
      "inset: 0",
      "margin: auto",
      "border: none",
      "border-radius: 16px",
      "padding: 24px 20px",
      "max-width: 320px",
      "width: calc(100vw - 48px)",
      "max-height: calc(100dvh - 48px)",
      "background: #fff",
      "box-shadow: 0 8px 32px rgba(0,0,0,0.25)",
      "font-family: inherit",
    ].join(";");

    const heading = document.createElement("h2");
    heading.textContent = title;
    heading.style.cssText =
      "margin: 0 0 8px; font-size: 17px; font-weight: 600;";

    const body = document.createElement("p");
    body.textContent = message;
    body.style.cssText =
      "margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: #555;";

    const actions = document.createElement("div");
    actions.style.cssText =
      "display: flex; gap: 12px; justify-content: flex-end;";

    const okBtn = document.createElement("button");
    okBtn.textContent = "Got it";
    okBtn.style.cssText =
      "font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 10px; border: none; cursor: pointer; background: #0b57d0; color: #fff;";

    const close = () => {
      dialog.close();
      dialog.remove();
      resolve();
    };

    okBtn.onclick = close;
    dialog.oncancel = (e) => {
      e.preventDefault();
      close();
    };

    actions.append(okBtn);
    dialog.append(heading, body, actions);
    document.body.appendChild(dialog);
    dialog.showModal();
    okBtn.focus();
  });
}

/** True once the Shell is running from the home screen rather than a browser tab. */
function isInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari never reports display-mode for home-screen apps.
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }
  return [
    "standalone",
    "fullscreen",
    "minimal-ui",
    "window-controls-overlay",
  ].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
}

/**
 * Credential id of the passkey this device enrolled, base64url encoded. Wiping
 * this key is how a user re-enrolls (e.g. after restoring to a new phone, where
 * the old credential no longer resolves).
 */
const BIOMETRIC_CREDENTIAL_KEY = "gov:biometric-credential";

function base64UrlEncode(buffer: ArrayBuffer): string {
  let binary = "";
  new Uint8Array(buffer).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The Uint8Array<ArrayBuffer> annotations matter: WebAuthn's BufferSource
// rejects the SharedArrayBuffer-backed default TS infers for a bare Uint8Array.
function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomChallenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
}

type BiometricPlatform = "ios" | "android" | "other";

/**
 * Which biometric sheet the OS will raise, so our copy names the same thing the
 * user is looking at. This drives WORDING ONLY — see runBiometricCeremony() for
 * why the modality itself is not ours to choose.
 */
function detectBiometricPlatform(): BiometricPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ ships a desktop-Mac user agent; touch points give it away.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/**
 * Per-platform copy. `method` is advisory and travels back to the mini app so
 * its own UI can match: an older Touch ID iPhone still reports "face", because
 * the web has no way to ask which sensor a device actually has.
 */
const BIOMETRIC_UI: Record<
  BiometricPlatform,
  {
    method: BiometricMethod;
    /** Title on our consent sheet, shown before the OS sheet. */
    consentTitle: string;
    /** Shown when the device has no usable authenticator enrolled. */
    setupHint: string;
  }
> = {
  ios: {
    method: "face",
    consentTitle: "Unlock with Face ID",
    setupHint:
      "Face ID is not set up on this device. Add it in Settings → Face ID & Passcode, then try again.",
  },
  android: {
    method: "fingerprint",
    consentTitle: "Unlock with Fingerprint",
    setupHint:
      "No fingerprint is enrolled on this device. Add one in Settings → Security → Fingerprint, then try again.",
  },
  other: {
    method: "biometric",
    consentTitle: "Biometric Unlock",
    setupHint:
      "This device has no screen lock set up. Add one in your device settings, then try again.",
  },
};

/** Outcome of one WebAuthn ceremony. Environment problems throw instead. */
type BiometricOutcome = "verified" | "cancelled";

/**
 * Two-step flow over WebAuthn's platform authenticator:
 *
 *   1. ENROL  — first call has no stored credential, so `create()` registers a
 *               passkey. The enrolment sheet itself verifies the user, so this
 *               counts as a successful unlock.
 *   2. ASSERT — later calls `get()` against the stored credential, which raises
 *               the unlock sheet: fingerprint on Android, Face ID on iOS.
 *
 * `userVerification: "required"` is the whole modality request — WebAuthn has
 * no knob for "fingerprint, not face" or "biometric, not PIN". The OS picks the
 * sensor, and on Android a device PIN or pattern also satisfies it. Enforcing
 * one specific modality needs the native layer (Android BiometricPrompt with
 * BIOMETRIC_STRONG and no DEVICE_CREDENTIAL; iOS
 * deviceOwnerAuthenticationWithBiometrics).
 *
 * The challenge is generated and discarded client-side: with no server to sign
 * it back to, this proves "the device owner is present at this device", not an
 * authenticated identity. Any server-trusted flow needs a real challenge issued
 * and verified by the backend.
 */
async function runBiometricCeremony(
  user: PlatformUser | null,
): Promise<BiometricOutcome> {
  // Environment problems throw (rather than the silent "cancelled") so the
  // caller's error notice can say WHY nothing prompted — otherwise a missing
  // API is indistinguishable from the user dismissing the sheet.
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new Error(
      `WebAuthn is not available on this page (origin: ${
        typeof window === "undefined" ? "ssr" : window.location.origin
      }, secureContext: ${
        typeof window === "undefined" ? "n/a" : window.isSecureContext
      }). Browsers only expose it on HTTPS or localhost — an http:// LAN IP never has it.`,
    );
  }

  // True for *any* screen lock, sensor or not — it cannot tell us a face or
  // fingerprint sensor exists, only that user verification is possible at all.
  const hasUserVerification =
    await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  if (!hasUserVerification) {
    throw new Error(BIOMETRIC_UI[detectBiometricPlatform()].setupHint);
  }

  const storedId =
    privileged.localStorage?.getItem(BIOMETRIC_CREDENTIAL_KEY) ?? null;

  if (!storedId) {
    const created = (await privileged.credentials?.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: "Sewa", id: window.location.hostname },
        user: {
          // WebAuthn caps user.id at 64 bytes; longer ids make create() throw
          // a TypeError before the biometric sheet ever shows.
          id: new TextEncoder()
            .encode(user?.id ?? "sewa-device-user")
            .slice(0, 64),
          name: user?.email ?? "sewa-device-user",
          displayName: user?.fullName ?? "Sewa user",
        },
        // ES256 first, RS256 as the fallback Windows Hello still prefers.
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;

    if (!created) return "cancelled";

    privileged.localStorage?.setItem(
      BIOMETRIC_CREDENTIAL_KEY,
      base64UrlEncode(created.rawId),
    );
    return "verified";
  }

  try {
    const assertion = (await privileged.credentials?.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: window.location.hostname,
        allowCredentials: [{ type: "public-key", id: base64UrlDecode(storedId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    return assertion ? "verified" : "cancelled";
  } catch (error) {
    // NotAllowedError means EITHER the user dismissed the sheet OR the stored
    // credential is gone (passkeys cleared, app reinstalled, restored to a new
    // phone) — WebAuthn deliberately does not say which. Drop the enrolment so
    // the next attempt re-registers instead of failing forever; the cost when
    // it was a plain cancel is only that the next tap shows the enrolment sheet,
    // which verifies the user just the same.
    if ((error as DOMException)?.name === "NotAllowedError") {
      privileged.localStorage?.removeItem(BIOMETRIC_CREDENTIAL_KEY);
      return "cancelled";
    }
    throw error;
  }
}

interface PickedContact {
  contactName?: string;
  number: string;
}

/** Resolves null when the user closes the sheet without picking anyone. */
function manualContactEntry(): Promise<PickedContact | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = [
      // Same centering caveat as requestConsent(): Tailwind's preflight kills
      // the UA stylesheet's `margin: auto` on dialog.
      "position: fixed",
      "inset: 0",
      "margin: auto",
      "border: none",
      "border-radius: 16px",
      "padding: 24px 20px",
      "max-width: 320px",
      "width: calc(100vw - 48px)",
      "max-height: calc(100dvh - 48px)",
      "background: #fff",
      "box-shadow: 0 8px 32px rgba(0,0,0,0.25)",
      "font-family: inherit",
    ].join(";");

    const title = document.createElement("h2");
    title.textContent = "Select a contact";
    title.style.cssText = "margin: 0 0 8px; font-size: 17px; font-weight: 600;";

    const message = document.createElement("p");
    message.textContent =
      "This browser cannot open your device contact list. Enter the contact to share instead.";
    message.style.cssText =
      "margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #555;";

    const inputBase =
      "width: 100%; box-sizing: border-box; font-size: 14px; font-family: inherit; padding: 10px 12px; border: 1px solid #d5d5d5; border-radius: 10px; margin-bottom: 12px;";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Name (optional)";
    nameInput.autocomplete = "name";
    nameInput.style.cssText = inputBase;

    const numberInput = document.createElement("input");
    numberInput.type = "tel";
    numberInput.placeholder = "Phone number";
    numberInput.autocomplete = "tel";
    numberInput.style.cssText = inputBase;

    const error = document.createElement("p");
    error.style.cssText =
      "margin: -4px 0 12px; font-size: 13px; color: #c5221f; display: none;";

    const actions = document.createElement("div");
    actions.style.cssText =
      "display: flex; gap: 12px; justify-content: flex-end;";

    const buttonBase =
      "font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 10px; border: none; cursor: pointer;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `${buttonBase} background: #f0f0f0; color: #333;`;

    const shareBtn = document.createElement("button");
    shareBtn.textContent = "Share";
    shareBtn.style.cssText = `${buttonBase} background: #0b57d0; color: #fff;`;

    const close = (result: PickedContact | null) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    const submit = () => {
      const number = numberInput.value.trim();
      if (!/^\+?[\d\s-]{7,20}$/.test(number)) {
        error.textContent = "Enter a valid phone number.";
        error.style.display = "block";
        numberInput.focus();
        return;
      }
      close({ contactName: nameInput.value.trim() || undefined, number });
    };

    cancelBtn.onclick = () => close(null);
    shareBtn.onclick = submit;
    numberInput.onkeydown = (e) => {
      if (e.key === "Enter") submit();
    };
    // Esc key / back gesture
    dialog.oncancel = (e) => {
      e.preventDefault();
      close(null);
    };

    actions.append(cancelBtn, shareBtn);
    dialog.append(title, message, nameInput, numberInput, error, actions);
    document.body.appendChild(dialog);
    dialog.showModal();
    numberInput.focus();
  });
}

/**
 * Native Contact Picker where the browser has it (Chrome on Android only, and
 * only in a secure top-level context — which the Shell is and the mini-app
 * iframe is not, so this has to live host-side), manual entry everywhere else.
 * Resolves null when the user cancels either one.
 */
async function contactPicker(): Promise<PickedContact | null> {
  const nav = navigator as Navigator & {
    contacts?: {
      select: (
        properties: string[],
        options?: { multiple?: boolean },
      ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
    };
  };

  if (nav.contacts && "ContactsManager" in window) {
    try {
      const selected = await nav.contacts.select(["name", "tel"], {
        multiple: false,
      });
      if (selected.length === 0) return null;

      const number = selected[0].tel?.find((t) => t.trim())?.trim();
      if (!number) {
        throw new Error("The selected contact has no phone number");
      }
      return {
        contactName: selected[0].name?.find((n) => n.trim())?.trim(),
        number,
      };
    } catch (err: any) {
      // The API is advertised but unusable here (insecure context, embedded
      // frame, unsupported properties). Fall back rather than fail outright.
      if (err?.name !== "TypeError" && err?.name !== "SecurityError") throw err;
    }
  }

  return manualContactEntry();
}

function getFallbackMimeType(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

export function createShellServices(
  getConfig: () => PlatformServicesConfig,
  deps: { appearanceController?: AppearanceController } = {},
) {
  const { appearanceController } = deps;

  const appearance: ShellAppearanceService = appearanceController
    ? {
        getLocale: () => Promise.resolve(appearanceController.getLocale()),
        getTheme: () => Promise.resolve(appearanceController.getTheme()),
      }
    : nullAppearance;
  let navigationState: NavigationState = {
    app: "shell",
    route: "/",
    params: {},
    historyLength: 1,
  };

  const navigationHandlers = new Set<(state: NavigationState) => void>();

  const auth = {
    getUser: () => Promise.resolve(getConfig().getUser()),
    isAuthenticated: () => Promise.resolve(getConfig().getUser() !== null),
    logout: () => getConfig().logout(),
  };

  const permissions = {
    has: (permission: string) => {
      const user = getConfig().getUser();
      return user?.permissions?.includes(permission) ?? false;
    },
    list: () => getConfig().getUser()?.permissions ?? [],
  };

  const defaultFlags: Record<string, boolean> = {
    "new-checkout": false,
    "beta-dashboard": true,
    "enhanced-navigation": true,
  };

  const moduleFlags: Record<string, Record<string, boolean>> = {
    "driving-license": { "digital-wallet": true },
    "revenue-license": { "bulk-payment": false },
    "chat-mini-app": { "chat-enabled": true },
  };

  const flags = {
    isEnabled: (flag: string, moduleId?: string) => {
      if (moduleId && moduleFlags[moduleId]?.[flag] !== undefined) {
        return moduleFlags[moduleId][flag];
      }
      return defaultFlags[flag] ?? false;
    },
    getAll: (moduleId?: string) => {
      const result = { ...defaultFlags };
      if (moduleId && moduleFlags[moduleId]) {
        Object.assign(result, moduleFlags[moduleId]);
      }
      return result;
    },
    refresh: async () => {},
  };

  const globalConfig: Record<string, unknown> = {
    apiBaseUrl:
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.gov.example",
    environment: process.env.NODE_ENV ?? "development",
    // No hardcoded locale — resolved from the appearance controller (host-driven).
    locale: appearanceController?.getLocale().locale ?? "en-LK",
    currency: "NPR",
  };

  const moduleConfig: Record<string, Record<string, unknown>> = {
    "chat-mini-app": { exampleKey: "exampleValue" },
  };

  const config = {
    get: <T = unknown>(key: string, moduleId?: string): T | undefined => {
      if (moduleId && moduleConfig[moduleId]?.[key] !== undefined) {
        return moduleConfig[moduleId][key] as T;
      }
      return globalConfig[key] as T | undefined;
    },
    getAll: (moduleId?: string) => {
      const result = { ...globalConfig };
      if (moduleId && moduleConfig[moduleId]) {
        Object.assign(result, moduleConfig[moduleId]);
      }
      return result;
    },
  };

  const navigation = {
    navigate: async (target: NavigationTarget) => {
      navigationState = {
        app: target.app,
        route: target.route,
        params: target.params ?? {},
        historyLength: navigationState.historyLength + 1,
      };
      getConfig().navigate(
        target.app === "shell"
          ? target.route
          : `/mini-app/${target.app}${target.route === "/" ? "" : target.route}`,
      );
      navigationHandlers.forEach((h) => h(navigationState));
    },
    getCurrent: () => navigationState,
    onNavigate: (handler: (state: NavigationState) => void) => {
      navigationHandlers.add(handler);
      return () => navigationHandlers.delete(handler);
    },
  };

  const chat = {
    chat: async function* (
      messages: ChatMessage[],
      _options?: Record<string, unknown>,
    ) {
      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const json = JSON.parse(jsonStr);
                const content = json.choices?.[0]?.delta?.content || "";
                if (content) yield content;
              } catch {
                /* skip */
              }
            }
          }
        }

        if (buffer.startsWith("data: ")) {
          const jsonStr = buffer.slice(6).trim();
          if (jsonStr !== "[DONE]") {
            try {
              const json = JSON.parse(jsonStr);
              const content = json.choices?.[0]?.delta?.content || "";
              if (content) yield content;
            } catch {
              /* skip */
            }
          }
        }
      } catch (err) {
        console.error(
          "[chat] error:",
          err instanceof Error ? err.message : err,
        );
        yield "[error fetching reply]";
      }
    },
  };

  const device = {
    location: async (_options?: {
      highAccuracy?: boolean;
      timeout?: number;
      reason?: string;
    }) => {
      try {
        if (!(await ensureConsent(_options?.reason, "Location Access"))) {
          return {
            status: "denied",
            data: null,
            error: "User declined location access",
          } as unknown as DevicePermissionResponse<DeviceLocationResult>;
        }
        if (!privileged.geolocation)
          throw new Error("Geolocation not supported");
        const result = await new Promise<DevicePermissionResponse<DeviceLocationResult>>(
          (resolve, reject) => {
            privileged.geolocation!.getCurrentPosition(
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
        console.log("location data in host:", result);
        return  result ; 
      
      } catch (err) {
        console.log("Error on host in location:", err)
        return {
          status: "denied",
          data: null,
          error: err instanceof Error ? err.message : "Location access denied",
        } as unknown as any;
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
      } catch (error: any) {
        return {
          status: "denied",
          data: null,
          error: error?.message || "Camera capture cancelled",
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
      } catch (error: any) {
        return {
          status: "denied",
          error: error?.message || "Gallery selection cancelled",
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
      } catch (error: any) {
        return {
          status: "denied",
          error: error?.message || "File selection cancelled",
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
        let handle: FileSystemFileHandle | null = null;
        if (typeof (window as any).showSaveFilePicker === "function") {
          try {
            handle = await (window as any).showSaveFilePicker({
              suggestedName: options.fileName,
            });
          } catch (err: any) {
            if (err?.name === "AbortError") {
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
          const writable = await (handle as any).createWritable();
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
      } catch (error: any) {
        const isCancelled =
          error?.name === "AbortError" ||
          error?.message?.toLowerCase().includes("abort") ||
          error?.message?.toLowerCase().includes("cancelled") ||
          error?.message?.toLowerCase().includes("canceled");
        return {
          status: "denied",
          error: isCancelled
            ? "Download cancelled"
            : error?.message || "Download failed",
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
      } catch (error: any) {
        return {
          status: "denied",
          data: null,
          error: error?.message || "Contact selection cancelled",
        } as unknown as DevicePermissionResponse<DeviceContactResult>;
      }
    },
    biometric: async (options?: { reason?: string }) => {
      const ui = BIOMETRIC_UI[detectBiometricPlatform()];
      const fail = () =>
        ({ success: false, method: ui.method }) as DeviceBiometricResult;
      if (!isInstalledPwa()) {
        await showNotice(
          "Not available in the browser",
          `${ui.consentTitle} only works in the installed Sewa app. Add Sewa to your home screen and try again.`,
        );
        return fail();
      }

      if (!(await ensureConsent(options?.reason, ui.consentTitle, "Continue"))) {
        return fail();
      }

      try {
        const outcome = await runBiometricCeremony(getConfig().getUser());
        return {
          success: outcome === "verified",
          method: ui.method,
        } as DeviceBiometricResult;
      } catch (error: any) {
        // Everything reaching here is an environment problem (no WebAuthn, no
        // enrolled authenticator) — a plain cancel already came back as
        // "cancelled". Those messages are user-facing on purpose: on-device
        // there is no console to read.
        await showNotice(ui.consentTitle, error?.message ?? String(error));
        return fail();
      }
    },
    notifications: async (_options?: {
      requestPermission?: boolean;
      reason?: string;
    }) => ({ status: "granted", data: { granted: false } }) as unknown as any,
    network: async () =>
      ({
        status: "granted",
        data: {
          online: navigator.onLine,
          type: navigator.onLine ? "unknown" : "none",
        },
      }) as unknown as any,
    storage: {
      get: async (key: string) => {
        try {
          return privileged.localStorage?.getItem(`gov:${key}`) ?? null;
        } catch {
          return null;
        }
      },
      set: async (key: string, value: string) => {
        try {
          privileged.localStorage?.setItem(`gov:${key}`, value);
        } catch {
          /* */
        }
      },
      remove: async (key: string) => {
        try {
          privileged.localStorage?.removeItem(`gov:${key}`);
        } catch {
          /* */
        }
      },
    },
    info: async () => {
      const ua = navigator.userAgent;
      const isMobile = /Mobi|Android/i.test(ua);
      return {
        status: "granted",
        data: {
          platform: isMobile
            ? ua.includes("iPhone")
              ? "IOS"
              : "ANDROID"
            : "WEB",
          osVersion: "",
          appVersion: "1",
          deviceModel: ua,
          locale: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      } as unknown as any;
    },
  };

  const http = {
    get: async <T = unknown>(
      endpoint?: string,
      query?: Record<string, string>,
    ) => {
      try {
        const params = query ? new URLSearchParams(query).toString() : "";
        const res = await fetch(
          params ? `${endpoint ?? "/api"}?${params}` : (endpoint ?? "/api"),
        );
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP GET failed",
        } as unknown as HttpResult<T>;
      }
    },
    post: async <T = unknown>(
      endpoint?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP POST failed",
        } as unknown as HttpResult<T>;
      }
    },
    put: async <T = unknown>(
      endpoint?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP PUT failed",
        } as unknown as HttpResult<T>;
      }
    },
    patch: async <T = unknown>(
      endpoint?: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP PATCH failed",
        } as unknown as HttpResult<T>;
      }
    },
    delete: async <T = unknown>(
      endpoint?: string,
      headers?: Record<string, string>,
    ) => {
      try {
        const res = await fetch(endpoint ?? "/api", {
          method: "DELETE",
          headers,
        });
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: {},
        } as unknown as HttpResult<T>;
      } catch (err) {
        return {
          status: 0,
          error: err instanceof Error ? err.message : "HTTP DELETE failed",
        } as unknown as HttpResult<T>;
      }
    },
  };

  const api: ShellApiService = {
    request: async <T = unknown, B = unknown>(
      params: LocalApiRequestParams,
    ) => {
      try {
        const res = await fetch(
          params.endpoint?.startsWith("http") ||
            params.endpoint?.startsWith("/")
            ? params.endpoint
            : `https://api.example.com${params.endpoint}`,
          {
            method: params.method?.toUpperCase() || "POST",
            headers: {
              "Content-Type": "application/json",
              ...params.headers,
            },
            body: params.body ? JSON.stringify(params.body) : undefined,
          },
        );
        const data = await res.json();
        return {
          status: res.status,
          data: data as T,
          headers: { ...res.headers },
        } as unknown as LocalApiResult<T>;
      } catch (err) {
        const error = err instanceof Error ? err.message : "API request failed";
        return {
          status: 0,
          data: null as T,
          headers: {},
          error,
        } as unknown as LocalApiResult<T>;
      }
    },
  };

  const storage: ShellStorageService = {
    get: async (key: string) => {
      try {
        const result = await http.get<{ value?: string } | null>(
          `/api/storage/${key}`,
        );
        return result.data?.value ?? null;
      } catch {
        return null;
      }
    },
    set: async (key: string, value: string) => {
      await http.post("/api/storage", { key, value });
    },
    remove: async (key: string) => {
      await http.delete(`/api/storage/${key}`);
    },
  };

  return {
    auth,
    permissions,
    flags,
    config,
    navigation,
    chat,
    device,
    storage,
    api,
    http,
    appearance,
  };
}

const nullAppearance: ShellAppearanceService = {
  getLocale: () => Promise.resolve({ locale: "en-LK", language: "en", direction: "ltr" }),
  getTheme: () => Promise.resolve({ preference: "system", mode: "light" }),
};
