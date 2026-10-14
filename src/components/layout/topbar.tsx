"use client";

import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { topbarButtonClass } from "./topbar-actions";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface TopbarProps {
  user: Profile;
  sidebarCollapsed: boolean;
  actionsRef?: React.Ref<HTMLDivElement>;
}

export function Topbar({ user, sidebarCollapsed, actionsRef }: TopbarProps) {
  // @container + dezelfde padding (px-4 md:px-6) en schuifbalkruimte
  // (scrollbar-gutter) als <main>: zo is de inhoudsbreedte van de topbar
  // gelijk aan die van de pagina en kan <TopbarActions alignToColumn> de
  // knoppen op de paginakolom uitlijnen. --topbar-lead = logo (120) + gap (16).
  return (
    <header
      className={cn(
        "@container sticky top-0 z-40 flex h-14 items-center gap-4 overflow-hidden border-b-2 border-sidebar-primary bg-sidebar px-4 [scrollbar-gutter:stable] md:px-6",
        sidebarCollapsed && "[--topbar-lead:136px]"
      )}
    >
      <MobileNav user={user} className={topbarButtonClass} />

      {/* Vanaf md staat het logo in de sidebar; hier alleen op mobiel of
          wanneer de sidebar ingeklapt is. */}
      <Link
        href="/artikelen"
        className={cn("shrink-0", !sidebarCollapsed && "md:hidden")}
      >
        <Image
          src="/logo.png"
          alt="Knowledge Build"
          width={120}
          height={28}
          className="brightness-0 invert"
        />
      </Link>

      {/* Paginaknoppen via <TopbarActions>. Op mobiel is hier geen plek;
          daar tonen pagina's hun knoppen zelf. Leeg = onzichtbaar. */}
      <div
        ref={actionsRef}
        className="hidden items-center gap-1 md:flex md:empty:hidden"
      />

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle className={topbarButtonClass} />
        <UserMenu
          user={user}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        />
      </div>
    </header>
  );
}
