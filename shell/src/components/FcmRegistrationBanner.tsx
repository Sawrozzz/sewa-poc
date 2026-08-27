"use client";

import { useState } from "react";
import { useFcmToken } from "@/lib/useFcmToken";

/**
 * Owns the single `useFcmToken()` call for the app and surfaces its failures.
 *
 * Two things can go wrong and both used to be console-only: the user has not
 * granted notification permission (recoverable with a gesture-backed prompt),
 * and the `/api/fcm-register` call failed (recoverable with a retry).
 */
export default function FcmRegistrationBanner() {
  const {
    notificationPermission,
    registrationError,
    isRegistering,
    requestPermission,
    retryRegistration,
  } = useFcmToken();
  const [dismissed, setDismissed] = useState(false);

  const needsPermission = notificationPermission !== "granted";
  const blocked = notificationPermission === "denied";

  if (dismissed) return null;
  if (!needsPermission && !registrationError) return null;

  const title = needsPermission
    ? blocked
      ? "Notifications are blocked"
      : "Turn on notifications"
    : "Notifications unavailable";

  const body = needsPermission
    ? blocked
      ? "Your browser is blocking notifications for this site. Reset it from the padlock icon in the address bar to receive alerts."
      : "Allow notifications so we can keep you updated about your services."
    : (registrationError?.message ?? "We could not register this device for notifications.");

  // A blocked permission cannot be re-prompted, so no action is offered there.
  const action = needsPermission
    ? blocked
      ? null
      : { label: "Allow", onClick: () => void requestPermission() }
    : { label: isRegistering ? "Retrying…" : "Retry", onClick: retryRegistration };

  return (
    <div
      className="pinned-top-safe fixed left-4 right-4 z-50 p-3 rounded-lg shadow-lg bg-red-50 border border-red-200"
      role="alert"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{needsPermission ? "🔔" : "⚠️"}</span>
          <div>
            <p className="font-medium text-sm">{title}</p>
            <p className="text-xs text-gray-600">{body}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action ? (
            <button
              className="text-xs px-3 py-1 bg-gov-500 text-gov-950 font-medium rounded hover:bg-gov-600 transition disabled:opacity-60"
              disabled={isRegistering}
              onClick={action.onClick}
              type="button"
            >
              {action.label}
            </button>
          ) : null}
          <button
            aria-label="Dismiss"
            className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 transition"
            onClick={() => setDismissed(true)}
            type="button"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
