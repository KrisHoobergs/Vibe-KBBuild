import Link from "next/link";
import { PenLine, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate, getInitials, cn } from "@/lib/utils";
import { ARTICLE_STATUS_LABELS, ARTICLE_STATUS_ICON_COLORS } from "@/lib/constants";
import type { ArticleSummary } from "@/types";

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  draft: PenLine,
  in_review: Clock,
  published: CheckCircle2,
};

interface ArticleRowProps {
  article: ArticleSummary;
}

export function ArticleRow({ article }: ArticleRowProps) {
  const StatusIcon = STATUS_ICONS[article.status] ?? PenLine;

  return (
    <Link
      href={`/artikelen/${article.slug}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="shrink-0 w-[28px] flex justify-center">
            <StatusIcon
              className={cn("h-4 w-4", ARTICLE_STATUS_ICON_COLORS[article.status])}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">
          {ARTICLE_STATUS_LABELS[article.status]}
        </TooltipContent>
      </Tooltip>

      <span className="font-medium text-sm truncate min-w-0 flex-1">
        {article.title}
      </span>

      {article.tags.length > 0 && (
        <div className="hidden md:flex items-center gap-1 shrink-0">
          {article.tags.slice(0, 2).map((tag) => (
            <Badge key={tag.id} variant="outline" className="text-xs">
              {tag.name}
            </Badge>
          ))}
          {article.tags.length > 2 && (
            <span className="text-xs text-muted-foreground">
              +{article.tags.length - 2}
            </span>
          )}
        </div>
      )}

      <div className="hidden lg:flex items-center gap-2 shrink-0 w-[140px]">
        <Avatar className="h-5 w-5">
          <AvatarImage src={article.author.avatar_url ?? undefined} />
          <AvatarFallback className="text-[10px]">
            {getInitials(article.author.display_name)}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm text-muted-foreground truncate">
          {article.author.display_name}
        </span>
      </div>

      <span className="text-xs text-muted-foreground shrink-0 w-[80px] text-right">
        {formatDate(article.updated_at)}
      </span>
    </Link>
  );
}
