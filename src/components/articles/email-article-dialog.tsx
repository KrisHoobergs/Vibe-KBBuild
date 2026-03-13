"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendArticleByEmail } from "@/actions/email";
import { toast } from "sonner";
import type { ArticleWithRelations } from "@/types";

interface EmailArticleDialogProps {
  article: ArticleWithRelations;
  senderName: string;
}

export function EmailArticleDialog({ article, senderName }: EmailArticleDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    if (!email.trim()) return;

    startTransition(async () => {
      const result = await sendArticleByEmail({
        to: email.trim(),
        articleTitle: article.title,
        articleContent: article.content,
        articleExcerpt: article.excerpt,
        senderName,
      });

      if (result.success) {
        toast.success(`Email verstuurd naar ${email}`);
        setEmail("");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Fout bij het versturen");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="mr-2 h-4 w-4" />
          Mailen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Artikel mailen</DialogTitle>
          <DialogDescription>
            Verstuur &ldquo;{article.title}&rdquo; per email. De volledige
            inhoud wordt meegestuurd.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="email">Emailadres</Label>
          <Input
            id="email"
            type="email"
            placeholder="naam@voorbeeld.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isPending) handleSend();
            }}
            disabled={isPending}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button onClick={handleSend} disabled={isPending || !email.trim()}>
            {isPending ? "Versturen..." : "Versturen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
