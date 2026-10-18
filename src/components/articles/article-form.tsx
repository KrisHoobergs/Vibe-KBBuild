"use client";

import { useState, useCallback, useRef, useEffect, useEffectEvent } from "react";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TopbarActions,
  topbarButtonClass,
  topbarPrimaryButtonClass,
} from "@/components/layout/topbar-actions";
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
  // Loopt er een upload in de editor? Dan nog niet opslaan, anders gaat een
  // geplakte afbeelding als base64 mee of ontbreekt ze. De ref is meteen
  // bijgewerkt (ook voor Ctrl+S vlak na het plakken), de state voor de knoppen.
  const uploadsBezig = useRef(false);
  const [uploading, setUploading] = useState(false);
  const handleUploadingChange = useCallback((bezig: boolean) => {
    uploadsBezig.current = bezig;
    setUploading(bezig);
  }, []);
  const [contentDirty, setContentDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const handleEditorChange = useCallback(
    (json: Record<string, unknown>, text: string) => {
      contentJsonRef.current = json;
      contentTextRef.current = text;
      setContentJson(json);
      setContentText(text);
      setContentDirty(true);
    },
    []
  );

  // Niet-opgeslagen wijzigingen? Bepaalt of Annuleren eerst bevestiging vraagt.
  const initialTagIds = article?.tags.map((t) => t.id) ?? [];
  const dirty =
    contentDirty ||
    title !== (article?.title ?? "") ||
    excerpt !== (article?.excerpt ?? "") ||
    tagIds.length !== initialTagIds.length ||
    tagIds.some((id) => !initialTagIds.includes(id));

  async function handleSave() {
    if (saving) return;
    if (uploadsBezig.current) {
      toast.error("Wacht tot de afbeeldingen geüpload zijn");
      return;
    }

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

  function handleCancel() {
    if (dirty) {
      setDiscardOpen(true);
    } else {
      router.back();
    }
  }

  // Ctrl+S / Cmd+S slaat op, ook met de focus in de editor.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleSave();
    }
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // Tabblad sluiten of verversen met wijzigingen: de browser waarschuwt.
  // (Navigatie via de sidebar valt hier niet onder.)
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const saveLabel = saving ? "Opslaan..." : article ? "Opslaan" : "Aanmaken";

  return (
    <div className="space-y-6">
      {/* Desktop: in de vaste topbar, zodat je niet naar onderen hoeft te
          scrollen, op één lijn met de titel. 48rem = max-w-3xl van de
          paginacontainer in nieuw/ en [slug]/bewerken/. */}
      <TopbarActions alignToColumn="48rem">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={topbarPrimaryButtonClass}
              onClick={handleSave}
              disabled={saving || uploading}
            >
              <Save className="h-4 w-4" />
              {saveLabel}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ctrl+S</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="sm"
          className={topbarButtonClass}
          onClick={handleCancel}
        >
          <X className="h-4 w-4" />
          Annuleren
        </Button>
      </TopbarActions>

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
            onUploadingChange={handleUploadingChange}
          />
        </div>
      </div>

      {/* Mobiel: geen plek in de topbar, dus de knoppen plakken onderaan het
          scherm. -bottom-4/-mb-4/-mx-4 heffen main's p-4 op. */}
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 flex gap-2 border-t bg-background px-4 py-3 md:hidden">
        <Button onClick={handleSave} disabled={saving || uploading}>
          {saveLabel}
        </Button>
        <Button variant="outline" onClick={handleCancel}>
          Annuleren
        </Button>
      </div>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wijzigingen weggooien?</DialogTitle>
            <DialogDescription>
              Je hebt wijzigingen die nog niet opgeslagen zijn. Als je nu
              annuleert, gaan ze verloren.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Verder bewerken</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setDiscardOpen(false);
                router.back();
              }}
            >
              Weggooien
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
