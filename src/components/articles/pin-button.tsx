"use client";

import { useTransition } from "react";
import { Pin } from "lucide-react";
import { togglePinArticle } from "@/actions/articles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PinButtonProps {
  articleId: string;
  isPinned: boolean;
}

export function PinButton({ articleId, isPinned }: PinButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          disabled={isPending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startTransition(async () => { await togglePinArticle(articleId); });
          }}
          className={cn(
            "shrink-0 w-[28px] flex justify-center items-center rounded-sm transition-colors",
            "hover:text-amber-500 dark:hover:text-amber-400",
            isPinned
              ? "text-amber-500 dark:text-amber-400"
              : "text-muted-foreground/40 hover:text-amber-500",
            isPending && "opacity-50"
          )}
        >
          <Pin
            className={cn("h-3.5 w-3.5", isPinned && "fill-current")}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {isPinned ? "Losmaken" : "Vastpinnen"}
      </TooltipContent>
    </Tooltip>
  );
}
