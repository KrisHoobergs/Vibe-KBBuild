"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/use-user";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { uploadAvatar } from "@/actions/upload";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Set initial values when user loads
  if (user && !displayName) {
    setDisplayName(user.display_name);
  }

  if (loading) {
    return <div className="text-muted-foreground">Laden...</div>;
  }

  if (!user) {
    return null;
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", user!.id);

    if (error) {
      toast.error("Fout bij opslaan");
    } else {
      toast.success("Profiel opgeslagen");
      router.refresh();
    }
    setSaving(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.set("file", file);

    const result = await uploadAvatar(formData);
    if (result.success) {
      toast.success("Avatar bijgewerkt");
      router.refresh();
    } else {
      toast.error(result.error ?? "Fout bij uploaden");
    }
    setUploading(false);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Profiel</h1>

      <Card>
        <CardHeader>
          <CardTitle>Persoonlijke gegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar_url ?? undefined} />
              <AvatarFallback>{getInitials(user.display_name)}</AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="avatar" className="cursor-pointer">
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <span>{uploading ? "Uploaden..." : "Avatar wijzigen"}</span>
                </Button>
              </Label>
              <input
                id="avatar"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mailadres</Label>
            <Input id="email" value={user.email} disabled />
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Weergavenaam</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
