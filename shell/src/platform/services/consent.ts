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
