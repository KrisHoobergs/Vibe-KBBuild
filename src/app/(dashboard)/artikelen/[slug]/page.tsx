import { notFound } from "next/navigation";
import { getArticleBySlug } from "@/actions/articles";
import { ArticleHeader } from "@/components/articles/article-header";
import { ArticleRenderer } from "@/components/editor/renderers/article-renderer";
import { estimateReadingTime } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const readingTime = estimateReadingTime(article.content_text);
  const hasContent = Object.keys(article.content).length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ArticleHeader article={article} />

      <div className="text-sm text-muted-foreground">
        {readingTime} min leestijd
      </div>

      {hasContent ? (
        <ArticleRenderer content={article.content as Record<string, unknown>} />
      ) : article.content_text ? (
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <div className="whitespace-pre-wrap">{article.content_text}</div>
        </div>
      ) : (
        <p className="text-muted-foreground italic">
          Dit artikel heeft nog geen inhoud.
        </p>
      )}
    </div>
  );
}
