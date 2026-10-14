"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

/**
 * Knopstijl voor de donkere topbar (in beide thema's donker). De dark:-hover
 * overschrijft die van de ghost-variant (50% goud, te weinig contrast).
 */
export const topbarButtonClass =
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent";

/** Goud voor de hoofdactie in de topbar (op een ghost-knop). */
export const topbarPrimaryButtonClass =
  "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground dark:hover:bg-sidebar-primary/90";

const TopbarActionsSlotContext = createContext<HTMLElement | null>(null);

export const TopbarActionsSlotProvider = TopbarActionsSlotContext.Provider;

interface TopbarActionsProps {
  children: React.ReactNode;
  /**
   * Maximale breedte van de gecentreerde paginakolom (bv. "48rem" voor
   * max-w-3xl). Dan beginnen de knoppen op dezelfde lijn als de inhoud
   * eronder; zonder deze prop staan ze links in de topbar.
   */
  alignToColumn?: string;
}

/**
 * Zet paginaspecifieke knoppen in de topbar, zodat ze zichtbaar blijven
 * terwijl de inhoud scrolt. Via een portal: de knoppen houden hun eigen
 * state en handlers in de pagina, alleen de plek in de DOM verandert.
 */
export function TopbarActions({ children, alignToColumn }: TopbarActionsProps) {
  const slot = useContext(TopbarActionsSlotContext);
  if (!slot) return null;

  // 100cqw = inhoudsbreedte van de topbar, die (zelfde padding en
  // schuifbalkruimte) gelijk is aan die van <main>. --topbar-lead is de
  // ruimte die het logo vóór het slot inneemt bij een ingeklapte sidebar.
  const style = alignToColumn
    ? {
        marginLeft: `max(0px, calc((100cqw - ${alignToColumn}) / 2 - var(--topbar-lead, 0px)))`,
      }
    : undefined;

  return createPortal(
    <div className="flex items-center gap-1" style={style}>
      {children}
    </div>,
    slot
  );
}
