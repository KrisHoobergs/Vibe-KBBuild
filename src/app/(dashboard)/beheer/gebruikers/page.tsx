import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUsers, getInvitations } from "@/actions/admin";
import { UserManagement } from "@/components/admin/user-management";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/inloggen");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/artikelen");

  const [users, invitations] = await Promise.all([
    getUsers(),
    getInvitations(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gebruikersbeheer</h1>
      <UserManagement users={users} invitations={invitations} />
    </div>
  );
}
