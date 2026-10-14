"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  deleteMailSettings,
  saveMailSettings,
  sendTestMail,
} from "@/actions/mail";
import type { MailSettingsStatus } from "@/types";

interface MailSettingsFormProps {
  status: MailSettingsStatus;
}

export function MailSettingsForm({ status: initialStatus }: MailSettingsFormProps) {
  const [status, setStatus] = useState(initialStatus);
  const [editing, setEditing] = useState(!initialStatus.configured);
  const [gmailAddress, setGmailAddress] = useState(initialStatus.gmail_address ?? "");
  const [appPassword, setAppPassword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  function handleSave() {
    startSaving(async () => {
      const result = await saveMailSettings({
        gmail_address: gmailAddress,
        app_password: appPassword,
      });

      if (result.success && result.data) {
        toast.success("Gmail ingesteld en getest");
        setStatus(result.data);
        setAppPassword("");
        setEditing(false);
      } else {
        toast.error(result.error ?? "Opslaan mislukt");
      }
    });
  }

  function handleTest() {
    startTesting(async () => {
      const result = await sendTestMail();
      if (result.success) {
        toast.success(`Testmail verstuurd naar ${status.gmail_address}`);
      } else {
        toast.error(result.error ?? "Testmail mislukt");
      }
    });
  }

  function handleDelete() {
    startDeleting(async () => {
      const result = await deleteMailSettings();
      if (result.success) {
        toast.success("Gmail-instelling verwijderd");
        setStatus({ configured: false, gmail_address: null });
        setGmailAddress("");
        setDeleteOpen(false);
        setEditing(true);
      } else {
        toast.error(result.error ?? "Verwijderen mislukt");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-mail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {status.configured && !editing ? (
          <>
            <p className="text-sm">
              Artikels die je verstuurt, vertrekken vanaf{" "}
              <span className="font-medium">{status.gmail_address}</span> en
              staan daarna in je Verzonden items in Gmail.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleTest} disabled={isTesting}>
                {isTesting ? "Versturen..." : "Testmail sturen"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                Wijzigen
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                Verwijderen
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Artikels verstuur je vanuit je eigen Google-account. Daarvoor
                heb je een app-wachtwoord nodig, niet je gewone wachtwoord:
              </p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Zet tweestapsverificatie aan in je Google-account.</li>
                <li>
                  Maak een app-wachtwoord aan op{" "}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    myaccount.google.com/apppasswords
                  </a>
                  .
                </li>
                <li>Vul hieronder je Google-adres en de 16 letters in.</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gmailAddress">Google-adres</Label>
              <Input
                id="gmailAddress"
                type="email"
                autoComplete="email"
                value={gmailAddress}
                onChange={(e) => setGmailAddress(e.target.value)}
                placeholder="naam@gmail.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="appPassword">App-wachtwoord</Label>
              <Input
                id="appPassword"
                type="password"
                autoComplete="new-password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder="16 letters"
              />
              <p className="text-sm text-muted-foreground">
                We testen de gegevens eerst bij Gmail. Het app-wachtwoord wordt
                versleuteld bewaard en nooit meer getoond.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={isSaving || !gmailAddress.trim() || !appPassword.trim()}
              >
                {isSaving ? "Testen en opslaan..." : "Opslaan"}
              </Button>
              {status.configured && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAppPassword("");
                    setEditing(false);
                  }}
                >
                  Annuleren
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gmail-instelling verwijderen?</DialogTitle>
            <DialogDescription>
              Je kunt daarna geen artikels meer versturen tot je Gmail opnieuw
              instelt. Het app-wachtwoord trek je eventueel ook in bij Google.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                Annuleren
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Verwijderen..." : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
