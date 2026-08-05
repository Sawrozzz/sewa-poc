'use client';

import { useState } from 'react';

import { showDialog, dialogButtonPrimary, dialogButtonSecondary, dialogInput } from './dialog';

export interface PickedContact {
  contactName?: string;
  number: string;
}

interface ContactEntryFormProps {
  close: (result: PickedContact | null) => void;
}

function ContactEntryForm({ close }: ContactEntryFormProps) {
  const [contactName, setContactName] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = number.trim();
    if (!/^\+?[\d\s-]{7,20}$/.test(trimmed)) {
      setError('Enter a valid phone number.');
      return;
    }
    close({ contactName: contactName.trim() || undefined, number: trimmed });
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Name (optional)"
        autoComplete="name"
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        className={dialogInput}
      />
      <input
        type="tel"
        placeholder="Phone number"
        autoComplete="tel"
        autoFocus
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className={dialogInput}
      />
      {error ? <p className="-mt-1 mb-3 text-[13px] text-red-600">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className={dialogButtonSecondary} onClick={() => close(null)}>
          Cancel
        </button>
        <button type="button" className={dialogButtonPrimary} onClick={submit}>
          Share
        </button>
      </div>
    </div>
  );
}

/** Resolves null when the user closes the sheet without picking anyone. */
function manualContactEntry(): Promise<PickedContact | null> {
  return showDialog<PickedContact | null>({
    title: 'Select a contact',
    message:
      'This browser cannot open your device contact list. Enter the contact to share instead.',
    cancelValue: null,
    children: ({ close }) => <ContactEntryForm close={close} />,
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

  if (nav.contacts && 'ContactsManager' in window) {
    try {
      const selected = await nav.contacts.select(['name', 'tel'], {
        multiple: false,
      });
      if (selected.length === 0) return null;

      const number = selected[0].tel?.find((t) => t.trim())?.trim();
      if (!number) {
        throw new Error('The selected contact has no phone number');
      }
      return {
        contactName: selected[0].name?.find((n) => n.trim())?.trim(),
        number,
      };
    } catch (err) {
      // The API is advertised but unusable here (insecure context, embedded
      // frame, unsupported properties). Fall back rather than fail outright.
      if (!(err instanceof Error) || (err.name !== 'TypeError' && err.name !== 'SecurityError')) {
        throw err;
      }
    }
  }

  return manualContactEntry();
}
