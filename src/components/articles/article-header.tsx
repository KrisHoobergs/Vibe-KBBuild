"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Send, CheckCircle, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime, getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ARTICLE_STATUS_LABELS, ARTICLE_STATUS_COLORS } from "@/lib/constants";
import {
  deleteArticle,
  submitForReview,
  publishArticle,
  revertToDraft,
} from "@/actions/articles";
import { toast } from "sonner";
import type { ArticleWithRelations } from "@/types";

interface ArticleHeaderProps {
  article: ArticleWithRelations;
}

export function ArticleHeader({ article }: ArticleHeaderProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [processing, setProcessing] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteArticle(article.id);
  }

  async function handleSubmitForReview() {
    setProcessing(true);
    const result = await submitForReview(article.id);
    if (result.success) {
      toast.success("Artikel ter beoordeling ingediend");
      router.refresh();
    } else {
      toast.error(result.error ?? "Fout");
    }
    setProcessing(false);
  }

  async function handlePublish() {
    setProcessing(true);
    const result = await publishArticle(article.id);
    if (result.success) {
      toast.success("Artikel gepubliceerd!");
      router.refresh();
    } else {
      toast.error(result.error ?? "Fout");
    }
    setProcessing(false);
  }

  async function handleRevert() {
    setProcessing(true);
    const result = await revertToDraft(article.id);
    if (result.success) {
      toast.success("Artikel teruggezet naar concept");
      router.refresh();
    } else {
      toast.error(result.error ?? "Fout");
    }
    setProcessing(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Badge
          variant="secondary"
          className={cn(ARTICLE_STATUS_COLORS[article.status])}
        >
          {ARTICLE_STATUS_LABELS[article.status]}
        </Badge>

        <div className="flex shrink-0 gap-2">
          {article.status === "draft" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmitForReview}
              disabled={processing}
            >
              <Send className="mr-2 h-4 w-4" />
              Ter beoordeling
            </Button>
          )}
          {article.status === "in_review" && (
            <>
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={processing}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Goedkeuren & publiceren
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevert}
                disabled={processing}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Terugzetten
              </Button>
            </>
          )}
          {article.status === "published" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevert}
              disabled={processing}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Terugzetten naar concept
            </Button>
          )}

          <Button variant="outline" size="sm" asChild>
            <Link href={`/artikelen/${article.slug}/bewerken`}>
              <Pencil className="mr-2 h-4 w-4" />
              Bewerken
            </Link>
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Verwijderen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Artikel verwijderen?</DialogTitle>
                <DialogDescription>
                  Weet je zeker dat je &ldquo;{article.title}&rdquo; wilt
                  verwijderen? Dit kan niet ongedaan worden gemaakt.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Verwijderen..." : "Ja, verwijderen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
  );
}
