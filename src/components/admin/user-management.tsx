"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2, Copy, Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { createPasswordResetLink, inviteUser, revokeInvitation } from "@/actions/admin";
import { formatDate, formatDateTime, getInitials } from "@/lib/utils";
import { toast } from "sonner";
import type { Profile, Invitation } from "@/types";

interface UserManagementProps {
  users: Profile[];
  invitations: Invitation[];
  /** Eigen login: de beheerder maakt herstellinks (er is geen mailserver). */
  herstellinks?: boolean;
}

export function UserManagement({ users, invitations, herstellinks = false }: UserManagementProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [herstel, setHerstel] = useState<{ naam: string; url: string; verloopt: string } | null>(null);
  const [herstelBezig, setHerstelBezig] = useState<string | null>(null);
  const [herstelGekopieerd, setHerstelGekopieerd] = useState(false);

  async function handleHerstellink(gebruiker: Profile) {
    setHerstelBezig(gebruiker.id);
    const result = await createPasswordResetLink(gebruiker.id);
    setHerstelBezig(null);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Herstellink maken mislukt");
      return;
    }
    setHerstelGekopieerd(false);
    setHerstel({
      naam: gebruiker.display_name,
      url: `${window.location.origin}/wachtwoord-herstellen/${result.data.token}`,
      verloopt: result.data.expiresAt,
    });
  }

  async function kopieerHerstellink() {
    if (!herstel) return;
    await navigator.clipboard.writeText(herstel.url);
    setHerstelGekopieerd(true);
    toast.success("Herstellink gekopieerd");
  }

  async function handleInvite() {
    if (!email.trim()) return;
    setInviting(true);

    const result = await inviteUser(email.trim());
    if (result.success) {
      toast.success("Uitnodiging verstuurd");
      setEmail("");
      setDialogOpen(false);
      router.refresh();
    } else {
      toast.error(result.error ?? "Fout bij uitnodigen");
    }
    setInviting(false);
  }

  async function handleRevoke(id: string) {
    const result = await revokeInvitation(id);
    if (result.success) {
      toast.success("Uitnodiging ingetrokken");
      router.refresh();
    } else {
      toast.error(result.error ?? "Fout");
    }
  }

  function copyInviteLink(token: string) {
    const link = `${window.location.origin}/uitnodiging/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    toast.success("Link gekopieerd!");
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const pendingInvitations = invitations.filter(
    (inv) =>
      !inv.accepted_at && new Date(inv.expires_at) > new Date()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {users.length} {users.length === 1 ? "gebruiker" : "gebruikers"}
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Gebruiker uitnodigen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gebruiker uitnodigen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">E-mailadres</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="collega@bedrijf.nl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleInvite();
                  }}
                />
              </div>
              <Button onClick={handleInvite} disabled={inviting} className="w-full">
                {inviting ? "Uitnodigen..." : "Uitnodigen"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gebruikers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={u.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(u.display_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{u.display_name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {u.is_admin && <Badge variant="secondary">Admin</Badge>}
                <span className="text-xs text-muted-foreground">
                  Lid sinds {formatDate(u.created_at)}
                </span>
                {herstellinks && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleHerstellink(u)}
                    disabled={herstelBezig === u.id}
                    title="Herstellink maken om een nieuw wachtwoord in te stellen"
                  >
                    <KeyRound className="mr-1 h-3 w-3" />
                    Herstellink
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Openstaande uitnodigingen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Verloopt op {formatDate(inv.expires_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyInviteLink(inv.token)}
                  >
                    {copiedToken === inv.token ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <Copy className="mr-1 h-3 w-3" />
                    )}
                    Link kopiëren
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleRevoke(inv.id)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Intrekken
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!herstel} onOpenChange={(open) => !open && setHerstel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Herstellink voor {herstel?.naam}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Geef deze link zelf door. Hij werkt één keer en is geldig tot{" "}
              {herstel ? formatDateTime(herstel.verloopt) : ""}. Na het instellen van een nieuw
              wachtwoord worden alle bestaande sessies van deze gebruiker afgemeld.
            </p>
            <Input readOnly value={herstel?.url ?? ""} onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={kopieerHerstellink} className="w-full">
              {herstelGekopieerd ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              Link kopiëren
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
