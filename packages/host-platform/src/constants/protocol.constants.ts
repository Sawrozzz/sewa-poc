/**
 * Protocol constants — mirror of `mini-app-sdk/src/constants/protocol.constants.ts`.
 *
 * `@lizuz/mini-app-types` is a types-only package (no runtime JS), so the
 * runtime constants are inlined here; keep them in sync with
 * `mini-app-types/src/constants.ts` — the single source of truth.
 */

/** Protocol version — mirrors `@lizuz/mini-app-types` (single source). */
export const PROTOCOL_VERSION = "1.0.0";
/** Message channel used for all platform traffic. */
export const MESSAGE_CHANNEL = "gov-platform-sdk";
/** CustomEvent name the SDK dispatches on the window. */
export const PLATFORM_EVENT_NAME = "gov-platform-event";
/** Target the shell uses when addressing the host. */
export const HOST_TARGET = "shell";
/** Broadcast target — every connected mini app. */
export const BROADCAST_TARGET = "*";
/** Global key the host descriptor is published under. */
export const HOST_DESCRIPTOR_GLOBAL_KEY = "__GSA_HOST_DESCRIPTOR__";
/** Global key the SDK exposes itself under. */
export const SDK_GLOBAL_KEY = "__GSA_SDK__";
