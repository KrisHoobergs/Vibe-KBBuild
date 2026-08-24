import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ArticleList } from "./article-list";
import { ActiveTagFilter } from "./active-tag-filter";
import { getArticles } from "@/actions/articles";
import { getPreferences } from "@/actions/preferences";
import { getTagBySlug } from "@/actions/tags";
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
  let tagName: string | null = null;

  if (query) {
    const searchAllStatuses = allStatuses === "1" || !allStatuses;
    const statuses = searchAllStatuses
      ? ["draft", "in_review", "published"]
      : ["published"];
    const selectedTags = filterTags?.split(",").filter(Boolean);

    const results = await searchArticles({
      query,
      statuses,
      tags: selectedTags?.length ? selectedTags : undefined,
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
    const [result, activeTag] = await Promise.all([
      getArticles({
        page,
        tag,
        status,
        perPage: prefs.items_per_page,
        sort: prefs.default_sort,
      }),
      tag ? getTagBySlug(tag) : Promise.resolve(null),
    ]);
    articles = result.data;
    hasMore = result.hasMore;
    tagName = activeTag?.name ?? tag ?? null;
  }

  const pageUrl = (p: number) =>
    `/artikelen?page=${p}${tag ? `&tag=${tag}` : ""}${status ? `&status=${status}` : ""}`;

  return (
    <>
      {tagName && <ActiveTagFilter tagName={tagName} />}

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
              href={pageUrl(page - 1)}
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
              href={pageUrl(page + 1)}
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
