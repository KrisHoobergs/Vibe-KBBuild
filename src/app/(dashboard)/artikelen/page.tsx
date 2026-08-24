import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ArticleList } from "@/components/articles/article-list";
import { ArticleSearchHeader } from "@/components/articles/article-search-header";
import { getArticles } from "@/actions/articles";
import { searchArticles } from "@/actions/search";
import type { ArticleSummary } from "@/types";

interface Props {
  searchParams: Promise<{
    page?: string;
    tag?: string;
    status?: string;
    q?: string;
    allStatuses?: string;
    filterTags?: string;
  }>;
}

export default async function ArticlesPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const query = params.q?.trim();

  let articles: ArticleSummary[];
  let resultCount = 0;
  let hasMore = false;

  if (query) {
    const allStatuses = params.allStatuses === "1" || !params.allStatuses;
    const statuses = allStatuses
      ? ["draft", "in_review", "published"]
      : ["published"];
    const filterTags = params.filterTags?.split(",").filter(Boolean);

    const results = await searchArticles({
      query,
      statuses,
      tags: filterTags?.length ? filterTags : undefined,
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
        email: "",
        display_name: r.author_name,
        avatar_url: null,
        is_admin: false,
        created_at: "",
        updated_at: "",
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
    const result = await getArticles({
      page,
      tag: params.tag,
      status: params.status,
    });
    articles = result.data;
    hasMore = result.hasMore;
  }

  const pageUrl = (p: number) =>
    `/artikelen?page=${p}${params.tag ? `&tag=${params.tag}` : ""}${params.status ? `&status=${params.status}` : ""}`;

  return (
    <div className="space-y-6">
      <Suspense>
        <ArticleSearchHeader />
      </Suspense>

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
    </div>
  );
}
