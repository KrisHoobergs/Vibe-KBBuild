import { ArticleRow } from "./article-row";
import type { ArticleSummary } from "@/types";

interface ArticleListProps {
  articles: ArticleSummary[];
}

export function ArticleList({ articles }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          Geen artikelen gevonden
        </p>
        <p className="text-sm text-muted-foreground">
          Maak een nieuw artikel aan om te beginnen.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b text-xs font-medium text-muted-foreground">
        <span className="w-[28px]"></span>
        <span className="flex-1">Titel</span>
        <span className="hidden md:block">Tags</span>
        <span className="hidden lg:block w-[140px]">Auteur</span>
        <span className="w-[80px] text-right">Gewijzigd</span>
      </div>
      <div className="divide-y">
        {articles.map((article) => (
          <ArticleRow key={article.id} article={article} />
        ))}
      </div>
    </div>
  );
}
