import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ArticleList } from "./article-list";
import { getArticles } from "@/actions/articles";
import { getPreferences } from "@/actions/preferences";
import { searchArticles } from "@/actions/search";
import type { ArticleSummary } from "@/types";

interface ArticleListLoaderProps {
  page: number;
  query?: string;
  tag?: string;
  status?: string;
  allStatuses?: string;
  filterTags?: string;
}

export async function ArticleListLoader({
  page,
  query,
  tag,
  status,
  allStatuses,
  filterTags,
}: ArticleListLoaderProps) {
  let articles: ArticleSummary[];
  let resultCount = 0;
  let hasMore = false;

  // De enkelvoudige `tag` (tagkaarten, artikelbadges) en de meervoudige
  // `filterTags` (zoekpaneel) vormen samen één actieve selectie.
  const activeTagSlugs = [
    ...(tag ? [tag] : []),
    ...(filterTags?.split(",").filter(Boolean) ?? []),
  ].filter((slug, i, all) => all.indexOf(slug) === i);

  /** URL voor een pagina, met alle actieve filters erin. */
  const buildUrl = (overrides: { page?: number; tagSlugs?: string[] }) => {
    const slugs = overrides.tagSlugs ?? activeTagSlugs;
    const params = new URLSearchParams();
    if (overrides.page && overrides.page > 1) {
      params.set("page", String(overrides.page));
    }
    if (query) params.set("q", query);
    if (allStatuses) params.set("allStatuses", allStatuses);
    if (status) params.set("status", status);
    if (slugs.length > 0) params.set("filterTags", slugs.join(","));

    const qs = params.toString();
    return qs ? `/artikelen?${qs}` : "/artikelen";
  };

  if (query) {
    const searchAllStatuses = allStatuses === "1" || !allStatuses;
    const statuses = searchAllStatuses
      ? ["draft", "in_review", "published"]
      : ["published"];

    const results = await searchArticles({
      query,
      statuses,
      tags: activeTagSlugs.length ? activeTagSlugs : undefined,
    });
    articles = results.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      cover_image_url: r.cover_image_url,
      status: r.status,
      author: {
        id: "",
        display_name: r.author_name,
        avatar_url: null,
      },
      tags:
        r.tags?.map((t) => ({
          id: t.slug,
          name: t.name,
          slug: t.slug,
          created_at: "",
        })) ?? [],
      published_at: r.published_at,
      is_pinned: false,
      pin_order: 0,
      created_at: "",
      updated_at: "",
    }));
    resultCount = articles.length;
  } else {
    const prefs = await getPreferences();
    const result = await getArticles({
      page,
      tags: activeTagSlugs,
      status,
      perPage: prefs.items_per_page,
      sort: prefs.default_sort,
    });
    articles = result.data;
    hasMore = result.hasMore;
  }

  return (
    <>
      <div>
        {query && (
          <p className="mb-3 text-sm text-muted-foreground">
            {`${resultCount} ${resultCount === 1 ? "resultaat" : "resultaten"} voor "${query}"`}
          </p>
        )}
        <ArticleList articles={articles} />
      </div>

      {!query && (page > 1 || hasMore) && (
        <div className="flex justify-center items-center gap-2">
          {page > 1 ? (
            <Link
              href={buildUrl({ page: page - 1 })}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              Vorige
            </Link>
          ) : (
            <span className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 text-sm font-medium text-muted-foreground opacity-50">
              <ChevronLeft className="h-4 w-4" />
              Vorige
            </span>
          )}
          <span className="px-2 text-sm text-muted-foreground">
            Pagina {page}
          </span>
          {hasMore ? (
            <Link
              href={buildUrl({ page: page + 1 })}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Volgende
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-3 text-sm font-medium text-muted-foreground opacity-50">
              Volgende
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
    </>
  );
}
