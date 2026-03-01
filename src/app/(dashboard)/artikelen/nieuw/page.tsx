import { ArticleForm } from "@/components/articles/article-form";
import { getAllTags } from "@/actions/tags";

export default async function NewArticlePage() {
  const tags = await getAllTags();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Nieuw artikel</h1>
      <ArticleForm allTags={tags} />
    </div>
  );
}
