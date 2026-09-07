"use client";

import { BottomTabBar } from "./BottomTabBar";
import { MobileHomeTab } from "./MobileHomeTab";
import { MobileMenuTab } from "./MobileMenuTab";
import { MobileServicesTab } from "./MobileServicesTab";
import { useMobileTabs } from "./MobileTabsContext";
import { MobileTopBar } from "./MobileTopBar";

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
