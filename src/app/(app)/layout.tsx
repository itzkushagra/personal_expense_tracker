import { Sidebar, MobileTabBar } from "@/components/layout/sidebar";
import { QuickAdd } from "@/components/layout/quick-add";
import { PlatformBadgeSpace } from "@/components/layout/platform-badge-space";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4 pb-[calc(7rem+var(--badge-space,0px))] pt-16 md:p-8 md:pb-[calc(6rem+var(--badge-space,0px))] md:pt-8">
          {children}
        </div>
      </main>
      {/* Desktop: floating button. Phones: centre of the bottom tab bar. */}
      <QuickAdd className="fixed bottom-[calc(1.5rem+var(--badge-space,0px))] right-6 z-40 hidden md:block" shortcuts />
      <PlatformBadgeSpace />
      <MobileTabBar>
        <QuickAdd centered />
      </MobileTabBar>
    </div>
  );
}
