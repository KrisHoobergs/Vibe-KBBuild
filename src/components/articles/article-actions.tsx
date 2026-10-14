"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle,
  Mail,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  topbarButtonClass,
  topbarPrimaryButtonClass,
} from "@/components/layout/topbar-actions";
import {
  deleteArticle,
  submitForReview,
  publishArticle,
  revertToDraft,
} from "@/actions/articles";
import { toast } from "sonner";
import { SendArticleDialog } from "./send-article-dialog";
import type { ArticleWithRelations, MailSettingsStatus } from "@/types";

type Tone = "default" | "primary" | "destructive";

// Op de donkere topbar: goud voor de volgende statusstap, lichtrood voor
// verwijderen (text-destructive heeft daar te weinig contrast).
const TOPBAR_TONE_CLASSES: Record<Tone, string> = {
  default: topbarButtonClass,
  primary: topbarPrimaryButtonClass,
  destructive:
    "text-red-300 hover:bg-red-500/15 hover:text-red-200 dark:hover:bg-red-500/15",
};

interface ArticleActionsProps {
  article: ArticleWithRelations;
  mailStatus: MailSettingsStatus;
  /** "topbar": in de donkere topbar (desktop), "page": in de pagina (mobiel). */
  placement: "topbar" | "page";
}

export function ArticleActions({ article, mailStatus, placement }: ArticleActionsProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const topbar = placement === "topbar";

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

  function buttonProps(tone: Tone, label: string) {
    return {
      size: "sm" as const,
      "aria-label": label,
      ...(topbar
        ? { variant: "ghost" as const, className: TOPBAR_TONE_CLASSES[tone] }
        : {
            variant: tone === "primary" ? ("default" as const) : ("outline" as const),
            className: tone === "destructive" ? "text-destructive" : undefined,
          }),
    };
  }

  // Labels alleen als er plaats is: in de topbar vanaf 2xl (met open sidebar
  // passen ze pas rond 1450px), op een smalle telefoon alleen iconen.
  function content(Icon: LucideIcon, label: string) {
    return (
      <>
        <Icon className="h-4 w-4" />
        <span className={topbar ? "hidden 2xl:inline" : "hidden sm:inline"}>
          {label}
        </span>
      </>
    );
  }

  // Tooltip voor de icoonversie in de topbar; overbodig zodra het label staat.
  function withTooltip(label: string, trigger: React.ReactElement) {
    if (!topbar) return trigger;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="2xl:hidden">{label}</TooltipContent>
      </Tooltip>
    );
  }

  function statusButton(
    tone: Tone,
    Icon: LucideIcon,
    label: string,
    onClick: () => void
  ) {
    return withTooltip(
      label,
      <Button {...buttonProps(tone, label)} onClick={onClick} disabled={processing}>
        {content(Icon, label)}
      </Button>
    );
  }

  const mailButton = (
    <Button {...buttonProps("default", "Mailen")}>{content(Mail, "Mailen")}</Button>
  );

  return (
    <>
      {article.status === "draft" &&
        statusButton("primary", Send, "Ter beoordeling", handleSubmitForReview)}
      {article.status === "in_review" && (
        <>
          {statusButton("primary", CheckCircle, "Goedkeuren & publiceren", handlePublish)}
          {statusButton("default", RotateCcw, "Terugzetten", handleRevert)}
        </>
      )}
      {article.status === "published" &&
        statusButton("default", RotateCcw, "Terugzetten naar concept", handleRevert)}

      {/* De tooltip moet rond het hele venster staan: de trigger van het
          venster kan zelf geen Tooltip-root als kind hebben. */}
      {topbar ? (
        <Tooltip>
          <SendArticleDialog
            slug={article.slug}
            title={article.title}
            mailStatus={mailStatus}
            trigger={<TooltipTrigger asChild>{mailButton}</TooltipTrigger>}
          />
          <TooltipContent className="2xl:hidden">Mailen</TooltipContent>
        </Tooltip>
      ) : (
        <SendArticleDialog
          slug={article.slug}
          title={article.title}
          mailStatus={mailStatus}
          trigger={mailButton}
        />
      )}

      {withTooltip(
        "Afdrukken / PDF",
        <Button {...buttonProps("default", "Afdrukken / PDF")} asChild>
          <Link href={`/artikelen/${article.slug}/afdrukken`} target="_blank">
            {content(Printer, "Afdrukken / PDF")}
          </Link>
        </Button>
      )}

      {withTooltip(
        "Bewerken",
        <Button {...buttonProps("default", "Bewerken")} asChild>
          <Link href={`/artikelen/${article.slug}/bewerken`}>
            {content(Pencil, "Bewerken")}
          </Link>
        </Button>
      )}

      <Dialog>
        {withTooltip(
          "Verwijderen",
          <DialogTrigger asChild>
            <Button {...buttonProps("destructive", "Verwijderen")}>
              {content(Trash2, "Verwijderen")}
            </Button>
          </DialogTrigger>
        )}
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Artikel verwijderen?</DialogTitle>
            <DialogDescription>
              Weet je zeker dat je &ldquo;{article.title}&rdquo; wilt
              verwijderen? Dit kan niet ongedaan worden gemaakt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>
                Annuleren
              </Button>
            </DialogClose>
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
    </>
  );
}
