import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/profile/profile-form";
import { PreferencesForm } from "@/components/profile/preferences-form";
import type { Profile } from "@/types";

export default async function ProfilePage() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (!userId) {
    redirect("/inloggen");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single<Profile>();

  if (!profile) {
    redirect("/inloggen");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Profiel</h1>

      <Tabs defaultValue="gegevens">
        <TabsList>
          <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
          <TabsTrigger value="voorkeuren">Voorkeuren</TabsTrigger>
        </TabsList>

        <TabsContent value="gegevens">
          <ProfileForm profile={profile} />
        </TabsContent>

        <TabsContent value="voorkeuren">
          <PreferencesForm profile={profile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
