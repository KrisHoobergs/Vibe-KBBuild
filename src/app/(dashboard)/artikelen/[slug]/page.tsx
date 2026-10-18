import { notFound } from "next/navigation";
import type { JSONContent } from "@tiptap/core";
import { generateHTML } from "@tiptap/html/server";
import { getArticleBySlug } from "@/actions/articles";
import { getMailSettingsStatus } from "@/actions/mail";
import { ArticleHeader } from "@/components/articles/article-header";
import { leesExtensions } from "@/components/editor/extensions/server";
import { metAfbeeldingUrls, metSlotBreak } from "@/lib/artikel-html";
import { estimateReadingTime } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const [article, mailStatus] = await Promise.all([
    getArticleBySlug(slug),
    getMailSettingsStatus(),
  ]);

  if (!article) {
    notFound();
  }

  const readingTime = estimateReadingTime(article.content_text);

  // De inhoud wordt hier al HTML, zodat de browser voor het lezen geen editor
  // hoeft te laden. Base64-afbeeldingen krijgen een eigen adres, zodat ze niet
  // in de pagina zelf zitten. Lukt het niet (onverwachte inhoud), dan de platte tekst.
  let contentHtml: string | null = null;
  if (Object.keys(article.content).length > 0) {
    try {
      const versie = encodeURIComponent(article.updated_at);
      const doc = metAfbeeldingUrls(
        metSlotBreak(article.content as JSONContent),
        (n) => `/api/artikelen/${article.id}/afbeelding/${n}?v=${versie}`
      );
      contentHtml = generateHTML(doc, leesExtensions);
    } catch (error) {
      console.error("Artikel naar HTML omzetten mislukt:", error);
    }
  }

  // De kop heeft de inhoud niet nodig: zo gaat die maar één keer naar de browser.
  const kop = { ...article, content: {}, content_text: "" };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ArticleHeader article={kop} mailStatus={mailStatus} />

      <div className="text-sm text-muted-foreground">
        {readingTime} min leestijd
      </div>

      {contentHtml ? (
        <div className="tiptap ProseMirror" dangerouslySetInnerHTML={{ __html: contentHtml }} />
      ) : article.content_text ? (
        <div className="whitespace-pre-wrap">{article.content_text}</div>
      ) : (
        <p className="text-muted-foreground italic">
          Dit artikel heeft nog geen inhoud.
        </p>
      )}
    </div>
  );
}
