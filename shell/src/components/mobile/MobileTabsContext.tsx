"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type MobileTab = "home" | "services" | "menu";

interface MobileTabsValue {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
}

const MobileTabsContext = createContext<MobileTabsValue | null>(null);

/**
 * Which tab the phone-sized shell is showing.
 *
 * Deliberately *not* routed. The tab bar and every panel it switches between are
 * hidden at `md` and up by CSS alone, so this state has no effect on the desktop
 * layout — a URL segment or a JS breakpoint check would have made the two share
 * a fate, and the browser design has to stay exactly as it is.
 */
export function MobileTabsProvider({ children }: { children: ReactNode }) {
  const [activeTab, setTab] = useState<MobileTab>("home");

  const setActiveTab = useCallback((tab: MobileTab) => {
    setTab(tab);
    // Native tab bars land you at the top of the destination, and the tabs share
    // one document scroll here, so carrying the last offset over would drop the
    // user mid-list.
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(() => ({ activeTab, setActiveTab }), [activeTab, setActiveTab]);

  return <MobileTabsContext.Provider value={value}>{children}</MobileTabsContext.Provider>;
}

export function useMobileTabs(): MobileTabsValue {
  const ctx = useContext(MobileTabsContext);
  if (!ctx) throw new Error("useMobileTabs must be used within MobileTabsProvider");
  return ctx;
}
