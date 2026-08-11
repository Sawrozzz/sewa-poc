"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";

export type DialogVariant = "primary" | "secondary";

export interface DialogAction<T = unknown> {
  label: string;
  variant?: DialogVariant;
  autoFocus?: boolean;
  /** Value the dialog resolves with when this action is clicked. */
  value?: T;
  /** Overrides the default click behavior (default: resolve with `value`). */
  onClick?: () => void;
}

export interface DialogControls<T> {
  /** Closes the dialog and resolves its promise with `value`. */
  close: (value: T) => void;
}

export interface DialogOptions<T = unknown> {
  title: string;
  message?: string;
  /** Body content — a static node or a render function receiving dialog controls. */
  children?: ReactNode | ((controls: DialogControls<T>) => ReactNode);
  /** Footer actions rendered right-aligned. Omit and render your own in `children`. */
  actions?: DialogAction<T>[];
  /** Esc resolves with `cancelValue`. Defaults to true. */
  cancelable?: boolean;
  cancelValue?: T;
  maxWidth?: number;
}

export const dialogButton =
  "text-sm font-semibold px-4 py-2.5 rounded-xl border-none cursor-pointer transition-colors";
export const dialogButtonPrimary = `${dialogButton} bg-gov-500 text-gov-950 hover:bg-gov-600`;
export const dialogButtonSecondary = `${dialogButton} bg-gray-100 text-gray-700 hover:bg-gray-200`;
export const dialogInput =
  "w-full box-border text-sm font-sans px-3 py-2.5 border border-gray-300 rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-gov-500";

function DialogShell<T>({
  title,
  message,
  children,
  actions = [],
  cancelable = true,
  cancelValue,
  maxWidth = 320,
  onResolve,
}: DialogOptions<T> & { onResolve: (value: T) => void }) {
  useEffect(() => {
    if (!cancelable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onResolve(cancelValue as T);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancelable, cancelValue, onResolve]);

  const controls: DialogControls<T> = { close: onResolve };

  return (
    <div
      aria-label={title}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
    >
      <div className="w-full rounded-2xl bg-white p-6 shadow-2xl" style={{ maxWidth }}>
        <h2 className="mb-2 text-[17px] font-semibold text-gov-900">{title}</h2>
        {message ? <p className="mb-5 text-sm leading-5 text-gray-600">{message}</p> : null}
        {typeof children === "function" ? children(controls) : children}
        {actions.length > 0 ? (
          <div className="mt-5 flex justify-end gap-3">
            {actions.map((action) => (
              <button
                className={
                  action.variant === "secondary" ? dialogButtonSecondary : dialogButtonPrimary
                }
                key={action.label}
                onClick={action.onClick ?? (() => onResolve(action.value as T))}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Imperatively shows a dialog and resolves when the user acts. */
export function showDialog<T = boolean>(options: DialogOptions<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    const finish = (value: T) => {
      root.unmount();
      container.remove();
      resolve(value);
    };

    root.render(<DialogShell {...options} onResolve={finish} />);
  });
}
