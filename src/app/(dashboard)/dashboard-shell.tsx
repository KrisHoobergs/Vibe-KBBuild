"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { TopbarActionsSlotProvider } from "@/components/layout/topbar-actions";
import { ThemeSync } from "@/components/theme-sync";
import type { Profile } from "@/types";

interface DashboardShellProps {
  user: Profile;
  children: React.ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  // Plek in de topbar waar pagina's eigen knoppen in kunnen zetten.
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  // Hier i.p.v. in de sidebar: de topbar toont het logo zodra de sidebar
  // ingeklapt is en er zelf geen plaats meer voor heeft.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <TopbarActionsSlotProvider value={actionsSlot}>
      <div className="flex h-screen">
        <ThemeSync theme={user.theme} />
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar
            user={user}
            sidebarCollapsed={sidebarCollapsed}
            actionsRef={setActionsSlot}
          />
          {/* scrollbar-gutter: vaste ruimte voor de schuifbalk, ook de topbar
              reserveert die, zodat beide even breed zijn (zie Topbar). */}
          <main className="flex-1 overflow-y-auto p-4 [scrollbar-gutter:stable] md:p-6">
            {children}
          </main>
        </div>
      </div>
    </TopbarActionsSlotProvider>
  );
}
