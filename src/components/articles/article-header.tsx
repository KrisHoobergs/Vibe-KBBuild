"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { TopbarActions } from "@/components/layout/topbar-actions";
import { formatDateTime, getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ARTICLE_STATUS_LABELS, ARTICLE_STATUS_COLORS } from "@/lib/constants";
import { ArticleActions } from "./article-actions";
import type { ArticleWithRelations, MailSettingsStatus } from "@/types";

interface ArticleHeaderProps {
  article: ArticleWithRelations;
  mailStatus: MailSettingsStatus;
}

export function ArticleHeader({ article, mailStatus }: ArticleHeaderProps) {
  return (
    <>
      {/* Desktop: knoppen in de vaste topbar, zodat ze bij scrollen blijven staan. */}
      <TopbarActions>
        <ArticleActions article={article} mailStatus={mailStatus} placement="topbar" />
      </TopbarActions>

      {/* Mobiel: geen plek in de topbar, dus de knoppen plakken bovenaan de
          inhoud. Bewust buiten de header-div: sticky werkt alleen binnen de
          ouder, en de paginacontainer omvat het hele artikel.
          -top-4/-mt-4/-mx-4 heffen main's p-4 op: sticky houdt rekening met
          de padding van de scrollcontainer. */}
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 flex flex-wrap gap-2 border-b bg-background px-4 py-2 md:hidden">
        <ArticleActions article={article} mailStatus={mailStatus} placement="page" />
      </div>

      <div className="space-y-4">
        <div>
          <Badge
            variant="secondary"
            className={cn(ARTICLE_STATUS_COLORS[article.status])}
          >
            {ARTICLE_STATUS_LABELS[article.status]}
          </Badge>
        </div>

        <div>
          <h1 className="text-3xl font-bold">{article.title}</h1>
          {article.excerpt && (
            <p className="mt-1 text-lg text-muted-foreground">{article.excerpt}</p>
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={article.author.avatar_url ?? undefined} />
              <AvatarFallback className="text-[10px]">
                {getInitials(article.author.display_name)}
              </AvatarFallback>
            </Avatar>
            <span>
              Geschreven door{" "}
              <span className="font-medium text-foreground">
                {article.author.display_name}
              </span>
            </span>
          </div>

          {article.reviewer && (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={article.reviewer.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px]">
                  {getInitials(article.reviewer.display_name)}
                </AvatarFallback>
              </Avatar>
              <span>
                Gereviewd door{" "}
                <span className="font-medium text-foreground">
                  {article.reviewer.display_name}
                </span>
                {article.reviewed_at && (
                  <> op {formatDateTime(article.reviewed_at)}</>
                )}
              </span>
            </div>
          )}

          <span>Aangemaakt op {formatDateTime(article.created_at)}</span>
          <span>Bijgewerkt op {formatDateTime(article.updated_at)}</span>
        </div>

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags.map((tag) => (
              <Link key={tag.id} href={`/artikelen?tag=${tag.slug}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  {tag.name}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        <Separator />
      </div>
    </>
  );
}
