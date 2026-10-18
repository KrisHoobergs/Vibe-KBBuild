import { requireUser } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/components/profile/profile-form";
import { PreferencesForm } from "@/components/profile/preferences-form";
import { MailSettingsForm } from "@/components/profile/mail-settings-form";
import { getMailSettingsStatus } from "@/actions/mail";

const TABS = ["gegevens", "voorkeuren", "email"] as const;

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function ProfilePage({ searchParams }: Props) {
  const [profile, mailStatus, { tab }] = await Promise.all([
    requireUser(),
    getMailSettingsStatus(),
    searchParams,
  ]);

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
