import { Skeleton } from "@/components/ui/skeleton";
import { ITEMS_PER_PAGE } from "@/lib/constants";

export default function ArticlesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full rounded-lg" />

      <div className="rounded-lg border bg-card">
        <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b text-xs font-medium text-muted-foreground">
          <span className="w-[28px]"></span>
          <span className="w-[28px]"></span>
          <span className="flex-1">Titel</span>
          <span className="hidden md:block">Tags</span>
          <span className="hidden lg:block w-[140px]">Auteur</span>
          <span className="w-[80px] text-right">Gewijzigd</span>
        </div>
        <div className="divide-y">
          {Array.from({ length: ITEMS_PER_PAGE }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-[28px]" />
              <Skeleton className="h-4 w-[28px]" />
              <Skeleton className="h-4 flex-1 max-w-[320px]" />
              <Skeleton className="hidden md:block h-4 w-[100px]" />
              <Skeleton className="hidden lg:block h-4 w-[140px]" />
              <Skeleton className="h-4 w-[80px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
