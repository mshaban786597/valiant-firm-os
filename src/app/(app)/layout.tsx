import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { requireSessionOrg } from "@/lib/session-org";

export default async function AppShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSessionOrg();
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <MobileNav />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
