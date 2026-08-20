/**
 * Host API guard — patches the PUBLIC browser globals so mini apps see
 * friendly stubs instead of the real (privileged) APIs.
 *
 * The host runs in the SAME realm as mini apps, so this must be installed
 * BEFORE any mini-app code runs (see `PlatformProvider.init`). The shell's own
 * services keep working because they read the real implementations from
 * `./host-privileges`, captured at module-load time before the guard runs.
 */

function lock(obj: unknown, prop: string, value: unknown) {
  if (!obj || (typeof obj !== "object" && typeof obj !== "function") || !(prop in obj)) return;
  try {
    Object.defineProperty(obj, prop, { value, writable: false, configurable: false });
  } catch {
    /* ignore unfrozen / undefined */
  }
}

function deny(msg: string) {
  return () =>
    Promise.reject(
      new DOMException(
        `[HostGuard] ${msg} — direct browser API access is not supported in mini apps. Use the Mini App SDK instead.`,
        "NotAllowedError",
      ),
    );
}

function geoErr() {
  return {
    code: 1,
    message: "[HostGuard] Use sdk.device.location() instead.",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

/**
 * Blocks sensitive browser APIs on the shared window/navigator before any
 * mini-app bundle loads. Idempotent in effect (defineProperty locks).
 */
export function installHostApiGuard(): void {
  // ── Geolocation ────────────────────────────────────────────────
  if (navigator.geolocation) {
    lock(navigator, "geolocation", {
      getCurrentPosition: (_success: unknown, error?: unknown) => {
        if (typeof error === "function") error(geoErr());
      },
      watchPosition: (_success: unknown, error?: unknown) => {
        if (typeof error === "function") error(geoErr());
        return -1;
      },
      clearWatch: () => {},
    });
  }

  // ── Media (camera / screen) ────────────────────────────────────
  if (navigator.mediaDevices) {
    lock(navigator.mediaDevices, "getUserMedia", deny("Use sdk.device.camera()"));
    lock(navigator.mediaDevices, "getDisplayMedia", deny("Screen capture is disabled"));
  }

  // ── Clipboard read ─────────────────────────────────────────────
  if (navigator.clipboard) {
    lock(navigator.clipboard, "read", deny("Clipboard read is disabled. Use sdk.clipboard()"));
    lock(navigator.clipboard, "readText", deny("Clipboard read is disabled. Use sdk.clipboard()"));
  }

  // ── Notifications ──────────────────────────────────────────────
  // Intentionally NOT blocked: the shell itself needs real Notification API
  // for FCM push (useFcmToken / NotificationListener), and the Firebase SDK
  // reads the global `Notification` internally — stubbing it here breaks both
  // the permission prompt and token registration. Mini apps get their own
  // surface via the SDK (`sdk.device.notifications()`).

  // ── WebAuthn credentials ───────────────────────────────────────
  // if (navigator.credentials) {
  //   lock(navigator.credentials, "create", deny("Use sdk.device.biometric()"));
  //   lock(navigator.credentials, "get", deny("Use sdk.device.biometric()"));
  // }

  // ── Service workers (host PWA must keep working) ───────────────
  if (navigator.serviceWorker?.register) {
    const realRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    lock(navigator.serviceWorker, "register", (scriptURL: string | URL) => {
      const url = String(scriptURL);
      if (url.includes("/serwist/sw.js")) {
        return realRegister(scriptURL);
      }
      return Promise.reject(
        new DOMException(
          "[HostGuard] Mini apps may not register service workers.",
          "NotAllowedError",
        ),
      );
    });
  }

  // ── WebRTC ─────────────────────────────────────────────────────
  lock(window, "RTCPeerConnection", undefined);
  lock(window, "webkitRTCPeerConnection", undefined);

  // ── Hardware APIs ──────────────────────────────────────────────
  lock(navigator, "bluetooth", undefined);
  lock(navigator, "usb", undefined);
  lock(navigator, "serial", undefined);
  lock(navigator, "hid", undefined);
  lock(navigator, "vibrate", () => false);

  // ── File pickers (host uses <input type=file> instead) ─────────
  lock(window, "showOpenFilePicker", undefined);
  lock(window, "showSaveFilePicker", undefined);
  lock(window, "showDirectoryPicker", undefined);

  // ── localStorage / sessionStorage (host reads via privileged.*) ──
  Object.defineProperty(window, "localStorage", {
    get() {
      throw new DOMException(
        "[HostGuard] Direct localStorage access is blocked in mini apps. Use sdk.storage.get()/set() instead.",
        "SecurityError",
      );
    },
    set() {},
    configurable: false,
  });
  Object.defineProperty(window, "sessionStorage", {
    get() {
      throw new DOMException(
        "[HostGuard] Direct sessionStorage access is blocked in mini apps.",
        "SecurityError",
      );
    },
    set() {},
    configurable: false,
  });
}
