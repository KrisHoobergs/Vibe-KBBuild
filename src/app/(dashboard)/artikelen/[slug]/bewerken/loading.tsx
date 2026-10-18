import { Skeleton } from "@/components/ui/skeleton";

// Laadscherm voor het bewerken: de editor heeft veel code nodig, dus hier
// helpt een skelet. Volgt de opbouw van het artikelformulier. (De
// artikelpagina zelf heeft bewust geen laadscherm, zie row-link-indicator.tsx.)
export default function BewerkenLaden() {
  return (
    <div className="mx-auto max-w-3xl space-y-6" aria-busy="true" aria-label="Artikel laden">
      <h1 className="text-2xl font-bold">Artikel bewerken</h1>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
