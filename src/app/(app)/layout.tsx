import { Sidebar, MobileTabBar } from "@/components/layout/sidebar";
import { QuickAdd } from "@/components/layout/quick-add";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4 pb-28 pt-16 md:p-8 md:pb-24 md:pt-8">
          {children}
        </div>
      </main>
      {/* Desktop: floating button. Phones: centre of the bottom tab bar. */}
      <QuickAdd className="fixed bottom-6 right-6 z-40 hidden md:block" shortcuts />
      <MobileTabBar>
        <QuickAdd centered />
      </MobileTabBar>
    </div>
  );
}
