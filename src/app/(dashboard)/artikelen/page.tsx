import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArticleList } from "@/components/articles/article-list";
import { ArticleSearch } from "@/components/articles/article-search";
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Artikelen</h1>
          <p className="text-sm text-muted-foreground">
            {query
              ? `${totalCount} ${totalCount === 1 ? "resultaat" : "resultaten"} voor "${query}"`
              : `${totalCount} ${totalCount === 1 ? "artikel" : "artikelen"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Suspense>
            <ArticleSearch />
          </Suspense>
          <Button asChild>
            <Link href="/artikelen/nieuw">
              <Plus className="mr-2 h-4 w-4" />
              Nieuw artikel
            </Link>
          </Button>
        </div>
      </div>

      <ArticleList articles={articles} />

      {!query && totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              asChild
            >
              <Link
                href={`/artikelen?page=${p}${params.tag ? `&tag=${params.tag}` : ""}${params.status ? `&status=${params.status}` : ""}`}
              >
                {p}
              </Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
