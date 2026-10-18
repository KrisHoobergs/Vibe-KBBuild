import { Skeleton } from "@/components/ui/skeleton";

// Laadscherm voor een artikel: verschijnt meteen na een klik (Next laadt het
// vooraf mee met de link), in plaats van dat de lijst blijft staan tot alles
// binnen is. Volgt de opbouw van de artikelpagina.
export default function ArtikelLaden() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" aria-busy="true" aria-label="Artikel laden">
      <div className="space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <div className="border-t" />
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="border-t" />
      </div>
      <Skeleton className="h-4 w-28" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
