export interface PickedContact {
  contactName?: string;
  number: string;
}

/** Resolves null when the user closes the sheet without picking anyone. */
function manualContactEntry(): Promise<PickedContact | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = [
      // Same centering caveat as requestConsent(): Tailwind's preflight kills
      // the UA stylesheet's `margin: auto` on dialog.
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
    title.textContent = "Select a contact";
    title.style.cssText = "margin: 0 0 8px; font-size: 17px; font-weight: 600;";

    const message = document.createElement("p");
    message.textContent =
      "This browser cannot open your device contact list. Enter the contact to share instead.";
    message.style.cssText =
      "margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #555;";

    const inputBase =
      "width: 100%; box-sizing: border-box; font-size: 14px; font-family: inherit; padding: 10px 12px; border: 1px solid #d5d5d5; border-radius: 10px; margin-bottom: 12px;";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Name (optional)";
    nameInput.autocomplete = "name";
    nameInput.style.cssText = inputBase;

    const numberInput = document.createElement("input");
    numberInput.type = "tel";
    numberInput.placeholder = "Phone number";
    numberInput.autocomplete = "tel";
    numberInput.style.cssText = inputBase;

    const error = document.createElement("p");
    error.style.cssText =
      "margin: -4px 0 12px; font-size: 13px; color: #c5221f; display: none;";

    const actions = document.createElement("div");
    actions.style.cssText =
      "display: flex; gap: 12px; justify-content: flex-end;";

    const buttonBase =
      "font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 10px; border: none; cursor: pointer;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `${buttonBase} background: #f0f0f0; color: #333;`;

    const shareBtn = document.createElement("button");
    shareBtn.textContent = "Share";
    shareBtn.style.cssText = `${buttonBase} background: #0b57d0; color: #fff;`;

    const close = (result: PickedContact | null) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    const submit = () => {
      const number = numberInput.value.trim();
      if (!/^\+?[\d\s-]{7,20}$/.test(number)) {
        error.textContent = "Enter a valid phone number.";
        error.style.display = "block";
        numberInput.focus();
        return;
      }
      close({ contactName: nameInput.value.trim() || undefined, number });
    };

    cancelBtn.onclick = () => close(null);
    shareBtn.onclick = submit;
    numberInput.onkeydown = (e) => {
      if (e.key === "Enter") submit();
    };
    // Esc key / back gesture
    dialog.oncancel = (e) => {
      e.preventDefault();
      close(null);
    };

    actions.append(cancelBtn, shareBtn);
    dialog.append(title, message, nameInput, numberInput, error, actions);
    document.body.appendChild(dialog);
    dialog.showModal();
    numberInput.focus();
  });
}

/**
 * Native Contact Picker where the browser has it (Chrome on Android only, and
 * only in a secure top-level context — which the Shell is and the mini-app
 * iframe is not, so this has to live host-side), manual entry everywhere else.
 * Resolves null when the user cancels either one.
 */
export async function contactPicker(): Promise<PickedContact | null> {
  const nav = navigator as Navigator & {
    contacts?: {
      select: (
        properties: string[],
        options?: { multiple?: boolean },
      ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
    };
  };

  if (nav.contacts && "ContactsManager" in window) {
    try {
      const selected = await nav.contacts.select(["name", "tel"], {
        multiple: false,
      });
      if (selected.length === 0) return null;

      const number = selected[0].tel?.find((t) => t.trim())?.trim();
      if (!number) {
        throw new Error("The selected contact has no phone number");
      }
      return {
        contactName: selected[0].name?.find((n) => n.trim())?.trim(),
        number,
      };
    } catch (err: any) {
      // The API is advertised but unusable here (insecure context, embedded
      // frame, unsupported properties). Fall back rather than fail outright.
      if (err?.name !== "TypeError" && err?.name !== "SecurityError") throw err;
    }
  }

  return manualContactEntry();
}
