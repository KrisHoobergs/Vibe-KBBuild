"use client";

import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import type { Profile } from "@/types";

interface TopbarProps {
  user: Profile;
}

const sidebarBtn =
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function Topbar({ user }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b-2 border-sidebar-primary bg-sidebar px-4">
      <MobileNav user={user} className={sidebarBtn} />

      <Link href="/artikelen" className="mr-auto">
        <Image
          src="/logo.png"
          alt="Knowledge Build"
          width={120}
          height={28}
          className="brightness-0 invert"
        />
      </Link>

      <div className="flex items-center gap-2">
        <ThemeToggle className={sidebarBtn} />
        <UserMenu
          user={user}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        />
      </div>
    </header>
  );
}
