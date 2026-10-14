"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  FileText,
  Tags,
  Settings,
  Users,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface SidebarProps {
  user: Profile;
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { href: "/artikelen", label: "Artikelen", icon: FileText },
  { href: "/tags", label: "Tags", icon: Tags },
];

const adminItems = [
  { href: "/beheer", label: "Beheer", icon: Settings },
  { href: "/beheer/gebruikers", label: "Gebruikers", icon: Users },
];

export function Sidebar({ user, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r bg-sidebar md:block transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* overflow-hidden: tijdens het uitklappen is de sidebar nog smal,
            het logo mag dan niet over de topbar heen vallen. */}
        <div className="flex h-14 items-center gap-3 overflow-hidden border-b border-sidebar-border px-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </Button>
          {/* Ingeklapt is hier geen plaats; dan staat het logo in de topbar. */}
          {!collapsed && (
            <Link href="/artikelen" className="shrink-0">
              <Image
                src="/logo.png"
                alt="Knowledge Build"
                width={120}
                height={28}
                className="brightness-0 invert"
              />
            </Link>
          )}
        </div>

        <nav className={cn("flex-1 space-y-1", collapsed ? "p-2" : "p-3")}>
          {!collapsed && (
            <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
              Navigatie
            </div>
          )}
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const linkContent = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors",
                  collapsed
                    ? "justify-center px-2 py-2"
                    : "gap-3 px-3 py-2",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}

          {user.is_admin && (
            <>
              {!collapsed && (
                <div className="mb-2 mt-6 px-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
                  Beheer
                </div>
              )}
              {collapsed && <div className="mt-4" />}
              {adminItems.map((item) => {
                const isActive = pathname === item.href;
                const linkContent = (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center rounded-md text-sm font-medium transition-colors",
                      collapsed
                        ? "justify-center px-2 py-2"
                        : "gap-3 px-3 py-2",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && item.label}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                }

                return linkContent;
              })}
            </>
          )}
        </nav>
      </div>
    </aside>
  );
}
