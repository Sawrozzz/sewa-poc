/**
 * Privileged bridge — the shell's private access to sensitive browser APIs.
 *
 * `installHostApiGuard()` (in PlatformProvider) patches the PUBLIC globals
 * (`navigator.geolocation`, `localStorage`, ...) so mini apps see friendly
 * stubs instead. Because the host runs in the SAME realm as mini apps, the
 * shell's own services must keep working — so the real implementations are
 * captured HERE, at module-load time (before the guard runs), and every
 * privileged host consumer reads from this object instead of the globals.
 *
 * RULE: never touch these globals directly in host code.
 * Use `privileged.*` from this module.
 *
 * Non-sensitive, live values (e.g. `navigator.onLine`, `userAgent`,
 * `language`) are intentionally NOT patched and NOT bridged — the guard
 * leaves them alone so host + mini apps can both read them harmlessly.
 */

function safe<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null;
  }
}

export const privileged = {
  /** Real `window.localStorage` (host keeps `gov:*`, onboarding, debugger). */
  localStorage: safe<Storage>(() => window.localStorage),
  /** Real `window.sessionStorage` (Header's refresh flag). */
  sessionStorage: safe<Storage>(() => window.sessionStorage),
  /** Real `window.indexedDB` (plugin cache in runtime-loader + Header purge). */
  indexedDB: safe<IDBFactory>(() => window.indexedDB),
  /** Real `navigator.geolocation` (device service). */
  geolocation: safe<Geolocation>(() => navigator.geolocation),
  /** Real `navigator.mediaDevices` (reserved for future host camera flows). */
  mediaDevices: safe<MediaDevices>(() => navigator.mediaDevices),
  /** Real `navigator.clipboard` (reserved for future host clipboard flows). */
  clipboard: safe<Clipboard>(() => navigator.clipboard),
  /**
   * Real WebAuthn methods (biometric service). Bound copies, not the
   * container itself: the guard shadows `create`/`get` on the shared
   * `navigator.credentials` instance, so holding the object reference
   * would leave the host calling the denied stubs.
   */
  // credentials: safe<Pick<CredentialsContainer, "create" | "get">>(() => ({
  //   create: navigator.credentials.create.bind(navigator.credentials),
  //   get: navigator.credentials.get.bind(navigator.credentials),
  // })),
  
  /** Real `window.Notification` (host may surface its own notifications). */
  Notification: safe<typeof Notification>(() => window.Notification),
} as const;
