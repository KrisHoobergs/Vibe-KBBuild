import { notFound } from "next/navigation";
import { getArticleBySlug } from "@/actions/articles";
import { getAllTags } from "@/actions/tags";
import { ArticleForm } from "@/components/articles/article-form";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function EditArticlePage({ params }: Props) {
  const { slug } = await params;
  const [article, tags] = await Promise.all([
    getArticleBySlug(slug),
    getAllTags(),
  ]);

  if (!article) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Artikel bewerken</h1>
      <ArticleForm article={article} allTags={tags} />
    </div>
  );
}
