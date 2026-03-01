"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagSelector } from "./tag-selector";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { createArticle, updateArticle } from "@/actions/articles";
import { toast } from "sonner";
import type { ArticleWithRelations, Tag } from "@/types";

interface ArticleFormProps {
  article?: ArticleWithRelations;
  allTags: Tag[];
}

export function ArticleForm({ article, allTags }: ArticleFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(article?.title ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [contentJson, setContentJson] = useState<Record<string, unknown>>(
    (article?.content as Record<string, unknown>) ?? {}
  );
  const [contentText, setContentText] = useState(article?.content_text ?? "");
  const contentJsonRef = useRef<Record<string, unknown>>(contentJson);
  const contentTextRef = useRef<string>(contentText);
  const [tagIds, setTagIds] = useState<string[]>(
    article?.tags.map((t) => t.id) ?? []
  );
  const [saving, setSaving] = useState(false);

  const handleEditorChange = useCallback(
    (json: Record<string, unknown>, text: string) => {
      contentJsonRef.current = json;
      contentTextRef.current = text;
      setContentJson(json);
      setContentText(text);
    },
    []
  );

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Titel is verplicht");
      return;
    }

    setSaving(true);

    // Content als JSON string versturen om Server Action serialisatie-verlies te voorkomen
    const contentString = JSON.stringify(contentJsonRef.current);

    if (article) {
      const result = await updateArticle(article.id, {
        title,
        excerpt,
        content_json: contentString,
        content_text: contentTextRef.current,
        tag_ids: tagIds,
      });

      if (result.success) {
        toast.success("Artikel opgeslagen");
        router.push("/artikelen");
      } else {
        toast.error(result.error ?? "Fout bij opslaan");
      }
    } else {
      const result = await createArticle({
        title,
        excerpt,
        content_json: contentString,
        content_text: contentTextRef.current,
        tag_ids: tagIds,
      });

      if (result.success && result.data) {
        toast.success("Artikel aangemaakt");
        router.push("/artikelen");
      } else {
        toast.error(result.error ?? "Fout bij aanmaken");
      }
    }

    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Titel</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel van het artikel"
            className="text-lg font-medium"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="excerpt">Samenvatting</Label>
          <Textarea
            id="excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="Korte samenvatting (optioneel)"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <TagSelector
            allTags={allTags}
            selectedTagIds={tagIds}
            onChange={setTagIds}
          />
        </div>

        <div className="space-y-2">
          <Label>Inhoud</Label>
          <TiptapEditor
            content={contentJson}
            onChange={handleEditorChange}
            articleId={article?.id}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Opslaan..." : article ? "Opslaan" : "Aanmaken"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          Annuleren
        </Button>
      </div>
    </div>
  );
}
