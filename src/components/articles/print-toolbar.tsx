"use client";

import { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar() {
  // Open de printdialoog vanzelf zodra alles (incl. afbeeldingen) geladen is;
  // dit tabblad bestaat alleen om te printen. De knop blijft als fallback.
  useEffect(() => {
    const print = () => {
      // Kleine marge zodat de browser klaar is met de laatste layout-pass.
      setTimeout(() => window.print(), 150);
    };

    if (document.readyState === "complete") {
      print();
      return;
    }
    window.addEventListener("load", print);
    return () => window.removeEventListener("load", print);
  }, []);

  return (
    <div className="print:hidden mb-6 flex items-center justify-between gap-2 border-b pb-4">
      <p className="text-sm text-muted-foreground">
        Kies in de printdialoog &ldquo;Opslaan als PDF&rdquo; om een PDF te
        maken.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Afdrukken / PDF
        </Button>
        <Button variant="outline" onClick={() => window.close()}>
          <X className="mr-2 h-4 w-4" />
          Sluiten
        </Button>
      </div>
    </div>
  );
}
