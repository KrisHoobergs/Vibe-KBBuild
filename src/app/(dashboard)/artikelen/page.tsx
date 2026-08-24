import { Suspense } from "react";
import { ArticleSearchHeader } from "@/components/articles/article-search-header";
import { ArticleListLoader } from "@/components/articles/article-list-loader";
import { ArticleListSkeleton } from "@/components/articles/article-list-skeleton";

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

  // Key wisselt bij elke parameter die de lijst-query beïnvloedt, zodat de
  // Suspense-boundary opnieuw mount en de skeleton ook bij navigatie toont.
  const listKey = JSON.stringify({
    page,
    q: query ?? "",
    tag: params.tag ?? "",
    status: params.status ?? "",
    allStatuses: params.allStatuses ?? "",
    filterTags: params.filterTags ?? "",
  });

  return (
    <div className="space-y-6">
      <Suspense>
        <ArticleSearchHeader />
      </Suspense>

      <Suspense key={listKey} fallback={<ArticleListSkeleton />}>
        <ArticleListLoader
          page={page}
          query={query}
          tag={params.tag}
          status={params.status}
          allStatuses={params.allStatuses}
          filterTags={params.filterTags}
        />
      </Suspense>
    </div>
  );
}
