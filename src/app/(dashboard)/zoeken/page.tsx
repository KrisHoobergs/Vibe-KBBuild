"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PenLine, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchFilters } from "@/components/articles/search-filters";
import { searchArticles } from "@/actions/search";
import { formatDate, cn } from "@/lib/utils";
import {
  ARTICLE_STATUS_LABELS,
  ARTICLE_STATUS_ICON_COLORS,
} from "@/lib/constants";
import type { SearchResult } from "@/types";

const STATUS_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  draft: PenLine,
  in_review: Clock,
  published: CheckCircle2,
};

const ALL_STATUSES = ["published", "draft", "in_review"] as const;

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") ?? "";
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [currentQuery, setCurrentQuery] = useState(initialQuery);

  const handleFilterChange = useCallback(
    async (filters: {
      query: string;
      allStatuses: boolean;
      tags: string[];
    }) => {
      setCurrentQuery(filters.query);

      if (filters.query.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }

      setLoading(true);
      const statuses = filters.allStatuses
        ? [...ALL_STATUSES]
        : ["published"];
      const data = await searchArticles({
        query: filters.query.trim(),
        statuses,
        tags: filters.tags.length > 0 ? filters.tags : undefined,
      });
      setResults(data);
      setSearched(true);
      setLoading(false);

      // Update URL
      const params = new URLSearchParams();
      params.set("q", filters.query.trim());
      if (!filters.allStatuses) params.set("published", "1");
      if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
      router.replace(`/zoeken?${params.toString()}`);
    },
    [router]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Zoeken</h1>
        <p className="text-sm text-muted-foreground">
          Doorzoek artikelen op titel, samenvatting of inhoud
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SearchFilters
            initialQuery={initialQuery}
            autoFocus
            onFilterChange={handleFilterChange}
          />
        </CardContent>
      </Card>

      {loading && (
        <p className="text-sm text-muted-foreground">Zoeken...</p>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Geen resultaten
          </p>
          <p className="text-sm text-muted-foreground">
            Geen artikelen gevonden voor &ldquo;{currentQuery}&rdquo;
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {results.length}{" "}
            {results.length === 1 ? "resultaat" : "resultaten"}
          </p>
          <div className="rounded-lg border bg-card">
            <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b text-xs font-medium text-muted-foreground">
              <span className="w-[28px]"></span>
              <span className="flex-1">Titel</span>
              <span className="hidden md:block">Tags</span>
              <span className="hidden lg:block w-[140px]">Auteur</span>
              <span className="w-[80px] text-right">Datum</span>
            </div>
            <div className="divide-y">
              {results.map((result) => {
                const StatusIcon =
                  STATUS_ICONS[result.status] ?? PenLine;
                return (
                  <Link
                    key={result.id}
                    href={`/artikelen/${result.slug}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="shrink-0 w-[28px] flex justify-center">
                          <StatusIcon
                            className={cn(
                              "h-4 w-4",
                              ARTICLE_STATUS_ICON_COLORS[result.status]
                            )}
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {ARTICLE_STATUS_LABELS[result.status]}
                      </TooltipContent>
                    </Tooltip>

                    <span className="font-medium text-sm truncate min-w-0 flex-1">
                      {result.title}
                    </span>

                    {result.tags && result.tags.length > 0 && (
                      <div className="hidden md:flex items-center gap-1 shrink-0">
                        {result.tags.slice(0, 2).map((tag) => (
                          <Badge
                            key={tag.slug}
                            variant="outline"
                            className="text-xs"
                          >
                            {tag.name}
                          </Badge>
                        ))}
                        {result.tags.length > 2 && (
                          <span className="text-xs text-muted-foreground">
                            +{result.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}

                    <span className="hidden lg:block shrink-0 w-[140px] text-sm text-muted-foreground truncate">
                      {result.author_name}
                    </span>

                    <span className="text-xs text-muted-foreground shrink-0 w-[80px] text-right">
                      {result.published_at
                        ? formatDate(result.published_at)
                        : ""}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
