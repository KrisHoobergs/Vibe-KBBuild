import { requireUser } from "@/lib/auth";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // De proxy heeft de sessie al gecontroleerd; zonder profiel terug naar inloggen.
  const profile = await requireUser();

  return <DashboardShell user={profile}>{children}</DashboardShell>;
}
