"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

export function RowLinkIndicator() {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <Loader2
      aria-label="Bezig met laden"
      className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
    />
  );
}
