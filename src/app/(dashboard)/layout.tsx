import { getAuthDriver, requireUser } from "@/lib/auth";
import { SessionRefresher } from "@/components/auth/session-refresher";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // De proxy heeft de sessie al gecontroleerd; zonder profiel terug naar inloggen.
  const profile = await requireUser();

  return (
    <>
      <DashboardShell user={profile}>{children}</DashboardShell>
      {/* Eigen login: de sessie vanuit de browser laten verlengen. Als laatste
          element, zodat het de React-id's van de shell niet verschuift. */}
      {getAuthDriver().kind === "local" && <SessionRefresher />}
    </>
  );
}
