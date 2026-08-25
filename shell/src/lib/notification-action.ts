import { PushNotificationType } from "@/types";

// ---------------------------------------------------------------------------
// Actions — WHAT side effect a notification triggers.
// ---------------------------------------------------------------------------

const notificationActionList = {
  REGISTRY_UPDATE: {
    api: "/api/manifests",
    method: "GET",
    /**
     * Runtime cache the refreshed response is written back into, so the
     * NetworkFirst route in the service worker serves the new registry
     * immediately instead of waiting for the next navigation.
     */
    cacheName: "get-mini-app-api",
  },
} as const;

export type NotificationActionType = keyof typeof notificationActionList;

// ---------------------------------------------------------------------------
// Types — HOW a notification is presented.
// ---------------------------------------------------------------------------

interface NotificationTypeBehavior {
  /** Surface a visible notification (and the sound, in the foreground). */
  display: boolean;
  /** Run the side effect mapped to `actionType`. */
  runAction: boolean;
}

const notificationTypeBehaviors: Record<PushNotificationType, NotificationTypeBehavior> = {
  [PushNotificationType.PUSH]: { display: true, runAction: true },
  [PushNotificationType.SILENT_PUSH]: { display: false, runAction: true },
};

export interface NotificationResult {
  notificationType: PushNotificationType;
  actionType?: NotificationActionType;
  correlationId?: string;
  publishedAt?: string;
  title?: string;
  body?: string;
  /** Deep link opened by the `notificationclick` handler in the worker. */
  url?: string;
}

/**
 * Renders a notification. Implemented differently by the page (`new
 * Notification`) and by the worker (`registration.showNotification`), so the
 * decision of *whether* to display stays here while the *how* is injected.
 */
export interface NotificationPresenter {
  show(notification: NotificationResult): void | Promise<void>;
}

/** Shape shared by `firebase/messaging` and `firebase/messaging/sw` payloads. */
interface FcmMessagePayload {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const isNotificationActionType = (value: unknown): value is NotificationActionType =>
  typeof value === "string" && value in notificationActionList;

const isPushNotificationType = (value: unknown): value is PushNotificationType =>
  typeof value === "string" && (Object.values(PushNotificationType) as string[]).includes(value);

/**
 * Normalizes an FCM payload into a `NotificationResult`. Every value in
 * `payload.data` arrives as a string, so the discriminators are validated
 * rather than cast. An unrecognized `notificationType` falls back to `PUSH`:
 * showing an unexpected notification is safer than silently dropping it.
 */
export function parseNotificationPayload(payload: FcmMessagePayload): NotificationResult | null {
  const data = payload.data;
  if (!data && !payload.notification) return null;

  const rawType = data?.notificationType;
  if (rawType !== undefined && !isPushNotificationType(rawType)) {
    console.warn("Notification: unknown notificationType, defaulting to PUSH:", rawType);
  }

  const rawAction = data?.actionType;
  if (rawAction !== undefined && !isNotificationActionType(rawAction)) {
    console.warn("Notification: unknown actionType, ignoring:", rawAction);
  }

  return {
    notificationType: isPushNotificationType(rawType) ? rawType : PushNotificationType.PUSH,
    actionType: isNotificationActionType(rawAction) ? rawAction : undefined,
    correlationId: data?.correlationId,
    publishedAt: data?.publishedAt,
    title: payload.notification?.title ?? data?.title,
    body: payload.notification?.body ?? data?.body,
    url: data?.url,
  };
}

// ---------------------------------------------------------------------------
// Handling
// ---------------------------------------------------------------------------

export async function handleNotificationAction(notification: NotificationResult) {
  if (!notification.actionType) return;
  const action = notificationActionList[notification.actionType];

  try {
    const response = await fetch(action.api, {
      method: action.method,
      headers: {
        "Content-Type": "application/json",
        ...(notification.correlationId ? { "x-correlation-id": notification.correlationId } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Notification action failed: ${response.status} ${response.statusText}`);
    }

    // A fetch issued from the worker does not pass through its own `fetch`
    // handler, so the runtime cache has to be refreshed explicitly.
    if (action.cacheName && typeof caches !== "undefined") {
      const cache = await caches.open(action.cacheName);
      await cache.put(action.api, response.clone());
    }

    console.log(`Notification action executed: ${notification.actionType}`);
  } catch (error) {
    console.error(`Failed to execute notification action: ${notification.actionType}`, error);
  }
}

/**
 * Single entry point for a received push: `notificationType` decides whether
 * the user sees it, `actionType` decides what the app does about it.
 */
export async function handleNotification(
  notification: NotificationResult,
  presenter?: NotificationPresenter,
): Promise<void> {
  const behavior = notificationTypeBehaviors[notification.notificationType];

  if (behavior.display && presenter) {
    await presenter.show(notification);
  }

  if (behavior.runAction) {
    await handleNotificationAction(notification);
  }
}
