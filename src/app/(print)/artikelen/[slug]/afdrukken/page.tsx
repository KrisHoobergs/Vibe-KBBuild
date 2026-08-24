import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateHTML } from "@tiptap/html";
import { getArticleBySlug } from "@/actions/articles";
import { serverExtensions } from "@/components/editor/extensions/server";
import { PrintToolbar } from "@/components/articles/print-toolbar";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string }>;
}

// De documenttitel wordt de voorgestelde bestandsnaam bij "Opslaan als PDF".
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  return { title: article?.title ?? "Artikel" };
}

export default async function ArticlePrintPage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const hasContent = Object.keys(article.content).length > 0;

  let contentHtml: string | null = null;
  if (hasContent) {
    try {
      contentHtml = generateHTML(
        article.content as Parameters<typeof generateHTML>[0],
        serverExtensions
      );
    } catch {
      contentHtml = null;
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PrintToolbar />

      <header className="mb-6 space-y-3">
        <h1 className="text-3xl font-bold">{article.title}</h1>

        {article.excerpt && (
          <p className="text-muted-foreground">{article.excerpt}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{article.author.display_name}</span>
          {article.published_at ? (
            <span>Gepubliceerd op {formatDate(article.published_at)}</span>
          ) : (
            <span>Bijgewerkt op {formatDate(article.updated_at)}</span>
          )}
        </div>

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags.map((tag) => (
              <Badge key={tag.id} variant="outline">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}

        <hr />
      </header>

      {contentHtml ? (
        <div
          className="ProseMirror"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      ) : article.content_text ? (
        <div className="whitespace-pre-wrap">{article.content_text}</div>
      ) : (
        <p className="italic text-muted-foreground">
          Dit artikel heeft nog geen inhoud.
        </p>
      )}
    </div>
  );
}
