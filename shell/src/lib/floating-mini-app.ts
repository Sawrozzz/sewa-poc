/**
 * The one mini app the shell presents as a floating bubble and bottom sheet —
 * the website-chat-widget pattern, active on every device class.
 *
 * Exported as a single constant so the widget that mounts it and the registry
 * rows agree on the id. The app is also listed normally in the launcher, the
 * services list, and the desktop grid — the bubble is the extra, always-visible
 * entry point rather than a replacement for those tiles.
 */
export const FLOATING_MINI_APP_ID = "chat-application";

export function isFloatingMiniApp(miniAppId: string | undefined): boolean {
  return miniAppId === FLOATING_MINI_APP_ID;
}
