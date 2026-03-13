"use client";

import { useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArticleRow } from "./article-row";
import { SortableArticleRow } from "./sortable-article-row";
import { reorderPinnedArticles } from "@/actions/articles";
import type { ArticleSummary } from "@/types";

interface ArticleListProps {
  articles: ArticleSummary[];
}

export function ArticleList({ articles }: ArticleListProps) {
  const [isPending, startTransition] = useTransition();

  const pinned = articles.filter((a) => a.is_pinned);
  const unpinned = articles.filter((a) => !a.is_pinned);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pinned.findIndex((a) => a.id === active.id);
    const newIndex = pinned.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...pinned];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const orderedIds = reordered.map((a) => a.id);
    startTransition(async () => {
      await reorderPinnedArticles(orderedIds);
    });
  }

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
        <span className="w-[28px]"></span>
        <span className="flex-1">Titel</span>
        <span className="hidden md:block">Tags</span>
        <span className="hidden lg:block w-[140px]">Auteur</span>
        <span className="w-[80px] text-right">Gewijzigd</span>
      </div>
      <div className={`divide-y ${isPending ? "opacity-70" : ""}`}>
        {pinned.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={pinned.map((a) => a.id)}
              strategy={verticalListSortingStrategy}
            >
              {pinned.map((article) => (
                <SortableArticleRow key={article.id} article={article} />
              ))}
            </SortableContext>
          </DndContext>
        )}
        {unpinned.map((article) => (
          <div key={article.id}>
            <ArticleRow article={article} />
          </div>
        ))}
      </div>
    </div>
  );
}
