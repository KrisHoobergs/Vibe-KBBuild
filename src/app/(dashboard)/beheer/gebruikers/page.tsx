import { getAuthDriver, requireAdmin } from "@/lib/auth";
import { getUsers, getInvitations } from "@/actions/admin";
import { UserManagement } from "@/components/admin/user-management";

export default async function UsersPage() {
  await requireAdmin();

  const [users, invitations] = await Promise.all([
    getUsers(),
    getInvitations(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gebruikersbeheer</h1>
      <UserManagement
        users={users}
        invitations={invitations}
        herstellinks={getAuthDriver().herstel === "beheerderslink"}
      />
    </div>
  );
}
