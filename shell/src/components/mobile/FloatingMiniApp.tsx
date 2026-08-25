"use client";

import { MessageCircleIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { FLOATING_MINI_APP_ID } from "@/lib/floating-mini-app";
import { useEmbeddedMiniApp } from "@/lib/use-embedded-mini-app";
import { useTheme } from "@/lib/use-theme";
import { useMiniAppBackButton } from "@/platform";
import { MiniAppErrorBoundary } from "../MiniAppErrorBoundary";

/**
 * The chat mini app as a floating bubble — the pattern a website chat widget
 * uses, applied to a mini app.
 *
 * Phone-only, and gated the same way every other mobile surface is: the caller
 * renders it inside `MobileShell`, whose subtree is `md:hidden`. That keeps the
 * split in CSS rather than in a `matchMedia` hook, so there is no SSR guess and
 * no first-paint flash — see the note on `MobileShell`.
 *
 * The panel is mounted lazily on first open and then kept in the DOM, hidden
 * rather than unmounted. A chat that reset its thread every time the bubble was
 * tapped would be worse than useless, and the mini app owns that state.
 */
export function FloatingMiniApp() {
  const t = useTranslations("FloatingChat");
  const { isDark } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  // Sticky: once opened, the bundle stays loaded for the life of the portal.
  const [hasOpened, setHasOpened] = useState(false);

  const { containerRef, state, error, name, isAvailable, retry } = useEmbeddedMiniApp({
    miniAppId: FLOATING_MINI_APP_ID,
    enabled: hasOpened,
  });

  const open = useCallback(() => {
    setHasOpened(true);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  // Hardware/browser back closes the panel, but only after the mini app has run
  // out of its own routes — the same precedence a full-page mini app gets.
  useMiniAppBackButton({ onExit: close, enabled: isOpen && state === "ready" });

  // The sheet covers the tab bar, so the page behind it must not scroll with it.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  // Nothing to float when the registry does not publish the app — no dead
  // bubble that opens onto an error.
  if (!isAvailable) return null;

  const surfaceClass = isDark ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white";

  return (
    <>
      {/* Bubble. Sits above the bottom tab bar rather than over it. */}
      {isOpen ? null : (
        <button
          aria-label={t("open", { name })}
          className="above-tabbar fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gov-600 text-white shadow-lg shadow-gov-900/25 transition active:scale-95 md:hidden"
          onClick={open}
          type="button"
        >
          <MessageCircleIcon size={26} strokeWidth={2.2} />
        </button>
      )}

      {/* Backdrop. Rendered only while open so it never swallows taps. */}
      {isOpen ? (
        <button
          aria-label={t("close")}
          className="fixed inset-0 z-60 bg-black/40 md:hidden"
          onClick={close}
          tabIndex={-1}
          type="button"
        />
      ) : null}

      {/*
       * Kept mounted from the first open onward — see the note above. `hidden`
       * rather than a conditional so the mini app's DOM, and its state, survive
       * the panel being dismissed.
       */}
      {hasOpened ? (
        <section
          aria-hidden={!isOpen}
          aria-label={name}
          className={`safe-bottom fixed inset-x-4 bottom-0 z-70 flex h-[80dvh] flex-col overflow-hidden rounded-t-3xl border-t shadow-2xl md:hidden ${surfaceClass} ${
            isOpen ? "animate-fade-in" : "hidden"
          }`}
        >
          <header
            className={`flex shrink-0 items-center gap-3 border-b px-4 py-3 ${
              isDark ? "border-gray-800" : "border-gray-100"
            }`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gov-100 text-gov-800">
              <MessageCircleIcon size={18} />
            </span>

            <h2
              className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                isDark ? "text-gray-100" : "text-gray-900"
              }`}
            >
              {name}
            </h2>

            <button
              aria-label={t("close")}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                isDark
                  ? "text-gray-400 hover:bg-gray-800 hover:text-white"
                  : "text-gray-500 hover:bg-gov-50 hover:text-gov-800"
              }`}
              onClick={close}
              type="button"
            >
              <XIcon size={20} />
            </button>
          </header>

          <div className="relative flex-1 overflow-auto">
            {state === "error" ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="mb-3 text-3xl">⚠️</span>
                <p className={`mb-5 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {error || t("load_failed")}
                </p>
                <button
                  className="rounded-lg bg-gov-500 px-5 py-2.5 text-sm font-medium text-gov-950"
                  onClick={retry}
                  type="button"
                >
                  {t("try_again")}
                </button>
              </div>
            ) : state !== "ready" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <span className="h-8 w-8 animate-spin rounded-full border-3 border-gov-200 border-t-gov-700" />
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {t("loading")}
                </p>
              </div>
            ) : null}

            {/*
             * Always rendered so the ref is attached before the bundle mounts,
             * and so the mounted tree is never torn down by a state change in
             * the shell around it.
             */}
            <MiniAppErrorBoundary
              miniAppId={FLOATING_MINI_APP_ID}
              moduleName={name}
              onRetry={retry}
              onUnload={close}
              retryAttempts={3}
            >
              <div
                className={`h-full w-full ${state === "ready" ? "" : "hidden"}`}
                ref={containerRef}
              />
            </MiniAppErrorBoundary>
          </div>
        </section>
      ) : null}
    </>
  );
}
