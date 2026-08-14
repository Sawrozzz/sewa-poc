"use client";

import { BottomTabBar } from "./BottomTabBar";
import { MobileHomeTab } from "./MobileHomeTab";
import { MobileMenuTab } from "./MobileMenuTab";
import { MobileServicesTab } from "./MobileServicesTab";
import { useMobileTabs } from "./MobileTabsContext";
import { MobileTopBar } from "./MobileTopBar";

export { MobileTabsProvider } from "./MobileTabsContext";

/**
 * The phone / installed-PWA face of the portal: an app bar, one tab panel, and
 * a bottom tab bar.
 *
 * Every element here is inside a `md:hidden` wrapper, and the desktop layout it
 * sits beside carries `max-md:hidden`. That split is done in CSS rather than
 * with a `matchMedia` hook on purpose — a JS breakpoint would have to guess
 * during SSR, flashing the wrong shell on first paint, and would let a bug in
 * the mobile code reach the browser layout. As written the two are mutually
 * exclusive at every viewport and the desktop tree is untouched.
 */
export function MobileShell() {
  const { activeTab } = useMobileTabs();

  return (
    <>
      <MobileTopBar />

      <main className="tabbar-gap md:hidden">
        {activeTab === "home" && <MobileHomeTab />}
        {activeTab === "services" && <MobileServicesTab />}
        {activeTab === "menu" && <MobileMenuTab />}
      </main>

      <BottomTabBar />
    </>
  );
}
