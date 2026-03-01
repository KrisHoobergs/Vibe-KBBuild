"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  FileText,
  Tags,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface SidebarProps {
  user: Profile;
}

const navItems = [
  { href: "/artikelen", label: "Artikelen", icon: FileText },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/zoeken", label: "Zoeken", icon: Search },
];

const adminItems = [
  { href: "/beheer", label: "Beheer", icon: Settings },
  { href: "/beheer/gebruikers", label: "Gebruikers", icon: Users },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-sidebar md:block">
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center border-b border-sidebar-border bg-white px-4 pt-1">
          <Link href="/artikelen" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Knowledge Build" width={140} height={32} />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Navigatie
          </div>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(item.href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}

          {user.is_admin && (
            <>
              <div className="mb-2 mt-6 px-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
                Beheer
              </div>
              {adminItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </nav>
      </div>
    </aside>
  );
}
