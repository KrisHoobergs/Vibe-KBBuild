import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/profile/profile-form";
import { PreferencesForm } from "@/components/profile/preferences-form";
import { MailSettingsForm } from "@/components/profile/mail-settings-form";
import { getMailSettingsStatus } from "@/actions/mail";
import type { Profile } from "@/types";

const TABS = ["gegevens", "voorkeuren", "email"] as const;

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function ProfilePage({ searchParams }: Props) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (!userId) {
    redirect("/inloggen");
  }

  const [{ data: profile }, mailStatus, { tab }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single<Profile>(),
    getMailSettingsStatus(),
    searchParams,
  ]);

  if (!profile) {
    redirect("/inloggen");
  }

  // ?tab=email: de artikelpagina linkt hierheen als Gmail nog niet ingesteld is.
  const defaultTab = TABS.find((t) => t === tab) ?? "gegevens";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Profiel</h1>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="gegevens">Gegevens</TabsTrigger>
          <TabsTrigger value="voorkeuren">Voorkeuren</TabsTrigger>
          <TabsTrigger value="email">E-mail</TabsTrigger>
        </TabsList>

        <TabsContent value="gegevens">
          <ProfileForm profile={profile} />
        </TabsContent>

        <TabsContent value="voorkeuren">
          <PreferencesForm profile={profile} />
        </TabsContent>

        <TabsContent value="email">
          <MailSettingsForm status={mailStatus} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
