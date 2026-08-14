"use client";

import type { ThemePreference } from "@sewa/host-platform";
import { useCallback, useEffect, useState } from "react";
import { usePlatform } from "@/context";

/**
 * Subscribes a component to the host's theme.
 *
 * The appearance controller is the single source of truth (it owns the
 * `data-theme` attribute, the stored preference and the mini-app broadcast), so
 * this only mirrors it into React state. Reading `appearance.getTheme()` once
 * into `useState` — the pattern the desktop header used — leaves every other
 * mounted surface stale after a toggle; subscribing to the same
 * `appearance.theme.changed` event mini apps receive keeps the shell's own
 * chrome in step no matter which control flipped it.
 */
export function useTheme() {
  const { appearance, eventBus } = usePlatform();
  const [theme, setTheme] = useState(() => appearance.getTheme());

  useEffect(() => {
    return eventBus.subscribe("appearance.theme.changed", () => {
      setTheme(appearance.getTheme());
    });
  }, [appearance, eventBus]);

  const setPreference = useCallback(
    (next: ThemePreference) => appearance.setThemePreference(next),
    [appearance],
  );

  const toggle = useCallback(() => appearance.toggleTheme(), [appearance]);

  return {
    /** The resolved mode actually painted — `system` is already collapsed here. */
    mode: theme.mode,
    isDark: theme.mode === "dark",
    /** What the user chose: `light`, `dark` or `system`. */
    preference: theme.preference,
    setPreference,
    toggle,
  };
}
