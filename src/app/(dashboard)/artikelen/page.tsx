import { Suspense } from "react";
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
  let totalCount: number;
  let totalPages: number;

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
    totalCount = articles.length;
    totalPages = 1;
  } else {
    const result = await getArticles({
      page,
      tag: params.tag,
      status: params.status,
    });
    articles = result.data;
    totalCount = result.count;
    totalPages = result.totalPages;
  }

  return (
    <div className="space-y-6">
      <Suspense>
        <ArticleSearchHeader />
      </Suspense>

      <div>
        <p className="mb-3 text-sm text-muted-foreground">
          {query
            ? `${totalCount} ${totalCount === 1 ? "resultaat" : "resultaten"} voor "${query}"`
            : `${totalCount} ${totalCount === 1 ? "artikel" : "artikelen"}`}
        </p>
        <ArticleList articles={articles} />
      </div>

      {!query && totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/artikelen?page=${p}${params.tag ? `&tag=${params.tag}` : ""}${params.status ? `&status=${params.status}` : ""}`}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors ${
                p === page
                  ? "bg-primary text-primary-foreground"
                  : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
