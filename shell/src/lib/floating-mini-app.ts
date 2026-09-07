/**
 * The one mini app the phone shell presents as a floating bubble instead of a
 * launcher tile — the website-chat-widget pattern.
 *
 * Exported as a single constant because two places have to agree on it: the
 * widget that mounts it, and the mobile lists that filter it out so it is not
 * offered twice. The desktop grid does not consult this at all — the bubble is
 * phone-only, so the browser layout keeps listing the app normally.
 */
export const FLOATING_MINI_APP_ID = "chat-application";

export function isFloatingMiniApp(miniAppId: string | undefined): boolean {
  return miniAppId === FLOATING_MINI_APP_ID;
}
