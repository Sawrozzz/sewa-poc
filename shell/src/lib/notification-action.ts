import type { PushNotificationType } from "@/types";

const notificationActionList = {
  REGISTRY_UPDATE: {
    api: "/api/manifests",
    method: "GET",
  },
} as const;

export type NotificationActionType = keyof typeof notificationActionList;

export interface NotificationResult {
  actionType: NotificationActionType;
  correlationId?: string;
  notificationType: PushNotificationType;
  publishedAt: Date | string;
}

export async function handleNotificationAction(notification: NotificationResult) {
  const action = notificationActionList[notification.actionType];

  try {
    const response = await fetch(action.api, {
      method: action.method,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Notification action failed: ${response.status} ${response.statusText}`);
    }

    console.log(`Notification action executed: ${notification.actionType}`);
  } catch (error) {
    console.error(`Failed to execute notification action: ${notification.actionType}`, error);
  }
}
