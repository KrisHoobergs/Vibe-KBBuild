"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { uploadAvatar } from "@/actions/upload";
import type { Profile } from "@/types";

interface ProfileFormProps {
  profile: Profile;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", profile.id);

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
    <Card>
      <CardHeader>
        <CardTitle>Persoonlijke gegevens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback>{getInitials(profile.display_name)}</AvatarFallback>
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
          <Input id="email" value={profile.email} disabled />
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
  );
}
