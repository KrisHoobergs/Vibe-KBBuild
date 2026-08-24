"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ThemeSync } from "@/components/theme-sync";
import type { Profile } from "@/types";

interface DashboardShellProps {
  user: Profile;
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  return (
    <div className="flex h-screen">
      <ThemeSync theme={user.theme} />
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
