"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchFilters } from "./search-filters";

export function ArticleSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [open, setOpen] = useState(!!initialQuery);

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
      router.push(`/artikelen?${params.toString()}`);
    },
    [router]
  );

  function handleClose() {
    setOpen(false);
    if (initialQuery) {
      router.push("/artikelen");
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="icon" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-end mb-3">
        <Button variant="ghost" size="sm" onClick={handleClose}>
          <X className="mr-1 h-4 w-4" />
          Sluiten
        </Button>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <SearchFilters
          initialQuery={initialQuery}
          initialAllStatuses={searchParams.get("allStatuses") === "1" || !searchParams.has("allStatuses")}
          initialTags={searchParams.get("filterTags")?.split(",").filter(Boolean) ?? []}
          autoFocus
          onFilterChange={handleFilterChange}
        />
      </div>
    </div>
  );
}
