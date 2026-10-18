"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

// Zichtbare reactie op een klik op een artikelrij, zolang het artikel laadt:
// de rij kleurt licht, onderaan loopt een balkje en naast de datum draait een
// spinner. Bewust geen laadscherm (loading.tsx) voor de artikelpagina: React
// houdt zo'n skelet minstens 300 ms in beeld, waardoor de tekst later
// verschijnt dan zonder. Moet binnen de <Link> staan (useLinkStatus), en die
// Link moet `relative` zijn.
export function RowLinkIndicator() {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-primary/5" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
        <span className="laadbalk block h-full w-1/3 bg-primary" />
      </span>
      <Loader2
        aria-label="Bezig met laden"
        className="h-3.5 w-3.5 shrink-0 animate-spin text-primary"
      />
    </>
  );
}
