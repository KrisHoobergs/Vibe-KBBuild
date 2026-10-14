"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { sendArticleByMail } from "@/actions/mail";
import type { MailSettingsStatus } from "@/types";

const MAX_RECIPIENTS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SendArticleDialogProps {
  slug: string;
  title: string;
  mailStatus: MailSettingsStatus;
  /** De knop die het venster opent (topbar- of paginastijl). */
  trigger: React.ReactNode;
}

/**
 * "Mailen": opent meteen het venster om het artikel via de eigen Gmail te
 * versturen. Zonder Gmail-instelling toont het venster waar je die instelt.
 */
export function SendArticleDialog({ slug, title, mailStatus, trigger }: SendArticleDialogProps) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, startSending] = useTransition();

  // Adressen mogen gescheiden zijn door komma, puntkomma, spatie of enter.
  const recipients = to.split(/[\s,;]+/).filter(Boolean);
  const invalid = recipients.filter((address) => !EMAIL_PATTERN.test(address));
  const tooMany = recipients.length > MAX_RECIPIENTS;
  const canSend = recipients.length > 0 && invalid.length === 0 && !tooMany;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || isSending) return;

    startSending(async () => {
      try {
        const result = await sendArticleByMail({ slug, to: recipients, message });
        if (result.success && result.data) {
          const count = result.data.count;
          toast.success(`Verstuurd naar ${count} ${count === 1 ? "ontvanger" : "ontvangers"}`);
          setTo("");
          setMessage("");
          setOpen(false);
        } else {
          toast.error(result.error ?? "Versturen mislukt");
        }
      } catch (error) {
        // Bv. een crash of time-out van de serveractie: nooit stil falen.
        console.error("Versturen mislukt:", error);
        toast.error(
          `Versturen mislukt: ${error instanceof Error ? error.message : "onbekende fout"}`
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSending && setOpen(next)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {mailStatus.configured ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Artikel versturen</DialogTitle>
              <DialogDescription>
                &ldquo;{title}&rdquo; wordt volledig in de mail gezet, ook voor
                ontvangers zonder toegang tot de kennisbank. Je verstuurt vanaf{" "}
                {mailStatus.gmail_address}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="send-to">Aan</Label>
              <Input
                id="send-to"
                type="text"
                inputMode="email"
                autoComplete="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="naam@bedrijf.be, collega@bedrijf.be"
                autoFocus
              />
              {invalid.length > 0 ? (
                <p className="text-sm text-destructive">
                  Ongeldig: {invalid.join(", ")}
                </p>
              ) : tooMany ? (
                <p className="text-sm text-destructive">
                  Maximaal {MAX_RECIPIENTS} ontvangers per keer
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Meerdere adressen scheid je met een komma.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="send-message">Persoonlijk bericht (optioneel)</Label>
              <Textarea
                id="send-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                // field-sizing-content negeert rows; min-h-40 ≈ 7 regels, het
                // vak groeit daarna mee met de tekst. rows is de fallback.
                rows={7}
                className="min-h-40"
                maxLength={2000}
                placeholder="Bijvoorbeeld: hier is de uitleg waar we het over hadden."
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSending}>
                  Annuleren
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!canSend || isSending}>
                {isSending ? "Versturen..." : "Versturen"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Artikel versturen</DialogTitle>
              <DialogDescription>
                Je verstuurt artikels vanuit je eigen Google-account. Stel dat
                eenmalig in bij je profiel; daarna kun je hier meteen mailen.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Annuleren</Button>
              </DialogClose>
              <Button asChild>
                <Link href="/profiel?tab=email">Gmail instellen</Link>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
