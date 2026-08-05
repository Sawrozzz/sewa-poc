import { showDialog } from "./dialog";

function requestConsent(params: {
  title: string;
  reason: string;
  allowLabel?: string;
}): Promise<boolean> {
  return showDialog<boolean>({
    title: params.title,
    message: params.reason,
    cancelValue: false,
    actions: [
      { label: "Cancel", variant: "secondary" },
      {
        label: params.allowLabel ?? "Allow",
        variant: "primary",
        value: true,
        autoFocus: true,
      },
    ],
  });
}

/** Resolves true when the mini-app gave no reason (nothing to prime) or the user allowed. */
export function ensureConsent(
  reason: string | undefined,
  title: string,
  allowLabel?: string,
): Promise<boolean> {
  if (!reason) return Promise.resolve(true);
  return requestConsent({ title, reason, allowLabel });
}

/** Single-button variant of requestConsent — nothing to decide, just to read. */
export function showNotice(title: string, message: string): Promise<void> {
  return showDialog<void>({
    title,
    message,
    actions: [{ label: "Got it", variant: "primary", autoFocus: true }],
  });
}
