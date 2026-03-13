"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { ArticleRow } from "./article-row";
import { cn } from "@/lib/utils";
import type { ArticleSummary } from "@/types";

interface SortableArticleRowProps {
  article: ArticleSummary;
}

export function SortableArticleRow({ article }: SortableArticleRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex items-center bg-amber-50/50 dark:bg-amber-950/20",
        isDragging && "z-10 shadow-lg opacity-80"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 w-8 flex justify-center items-center cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <ArticleRow article={article} />
      </div>
    </div>
  );
}
