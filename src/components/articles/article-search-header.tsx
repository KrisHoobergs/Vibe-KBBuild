"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchFilters } from "./search-filters";

export function ArticleSearchHeader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  // Ook openklappen bij een actief tagfilter, anders zie je je eigen selectie niet.
  const [open, setOpen] = useState(
    !!initialQuery || searchParams.has("filterTags") || searchParams.has("tag")
  );


  const handleFilterChange = useCallback(
    (filters: { query: string; allStatuses: boolean; tags: string[] }) => {
      const params = new URLSearchParams();
      if (filters.query.trim()) {
        params.set("q", filters.query.trim());
      }
      if (filters.allStatuses) {
        params.set("allStatuses", "1");
      }
      if (filters.tags.length > 0) {
        params.set("filterTags", filters.tags.join(","));
      }
      const qs = params.toString();
      router.push(qs ? `/artikelen?${qs}` : "/artikelen");
    },
    [router]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-lg font-semibold hover:text-primary/80 transition-colors"
        >
          Zoeken
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        <Button asChild>
          <Link href="/artikelen/nieuw">
            <Plus className="mr-2 h-4 w-4" />
            Nieuw artikel
          </Link>
        </Button>
      </div>

      {open && (
        // Geen kader of padding: zo lijnen het zoekveld en de wisknop binnenin
        // uit met "Zoeken" en "Nieuw artikel" in de kopregel erboven.
        <div>
          <SearchFilters
            initialQuery={initialQuery}
            initialAllStatuses={
              searchParams.get("allStatuses") === "1" ||
              !searchParams.has("allStatuses")
            }
            initialTags={[
              ...(searchParams.get("tag") ? [searchParams.get("tag")!] : []),
              ...(searchParams.get("filterTags")?.split(",").filter(Boolean) ??
                []),
            ].filter((slug, i, all) => all.indexOf(slug) === i)}
            autoFocus
            onFilterChange={handleFilterChange}
          />
        </div>
      )}
    </div>
  );
}
