"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, FileText, Tags, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface MobileNavProps {
  user: Profile;
  className?: string;
}

const navItems = [
  { href: "/artikelen", label: "Artikelen", icon: FileText },
  { href: "/tags", label: "Tags", icon: Tags },
];

const adminItems = [
  { href: "/beheer", label: "Beheer", icon: Settings },
  { href: "/beheer/gebruikers", label: "Gebruikers", icon: Users },
];

export function MobileNav({ user, className }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("md:hidden", className)}>
          <Menu className="h-5 w-5" />
          <span className="sr-only">Menu openen</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar">
        <SheetTitle className="sr-only">Navigatie</SheetTitle>
        <div className="flex h-14 items-center border-b border-sidebar-border bg-white px-4 pt-1">
          <Link
            href="/artikelen"
            className="flex items-center gap-2"
            onClick={() => setOpen(false)}
          >
            <Image src="/logo.png" alt="Knowledge Build" width={140} height={32} />
          </Link>
        </div>
        <nav className="space-y-1 p-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
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
                  onClick={() => setOpen(false)}
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
      </SheetContent>
    </Sheet>
  );
}
