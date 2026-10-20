import Image from "next/image";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import type { InstallatieWeergave } from "@/lib/installatie";

// Het logo linksboven en op de inlogpagina. Standaard het logo-bestand; met
// INSTALLATIE_LOGO=tekst de naam van de installatie, met een vierkantje in haar
// kleur (zoals het tabblad-icoon). In de balken neemt het tekstlogo exact de
// plaats van het logo in (120 px breed): de topbar rekent daarmee
// (--topbar-lead, zie topbar.tsx).

type Variant = "balk" | "wit" | "groot";

interface LogoProps {
  installatie: InstallatieWeergave | null;
  /** balk: donkere sidebar/topbar; wit: witte kop van het mobiele menu; groot: inlogpagina. */
  variant: Variant;
}

export function Logo({ installatie, variant }: LogoProps) {
  if (installatie?.logo !== "tekst") {
    return variant === "groot" ? (
      <Image src="/logo.png" alt={APP_NAME} width={180} height={40} priority />
    ) : (
      <Image
        src="/logo.png"
        alt={APP_NAME}
        width={120}
        height={28}
        className={variant === "balk" ? "brightness-0 invert" : undefined}
      />
    );
  }

  const groot = variant === "groot";
  return (
    <span
      className={cn("flex items-center", groot ? "gap-3" : "w-[120px] gap-2")}
      title={installatie.naam}
    >
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md font-bold leading-none",
          groot ? "size-10 text-lg" : "size-6 text-[11px]",
          variant === "balk" ? "ring-1 ring-white/25" : "ring-1 ring-black/10"
        )}
        style={{ backgroundColor: installatie.kleur, color: installatie.tekstkleur }}
      >
        {installatie.afkorting}
      </span>
      <span
        className={cn(
          "line-clamp-2 min-w-0 break-words font-heading font-bold leading-tight",
          groot ? "text-2xl text-foreground" : "text-[13px]",
          variant === "balk" && "text-sidebar-foreground",
          variant === "wit" && "text-[#023B49]"
        )}
      >
        {installatie.naam}
      </span>
    </span>
  );
}
