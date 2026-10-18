import { getValidInvitation } from "@/lib/db/repositories/invitations";
import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";
import Link from "next/link";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({ params }: Props) {
  const { token } = await params;

  // Op de server opgezocht (de bezoeker is nog niet ingelogd); de pagina toont
  // alleen het e-mailadres van deze ene uitnodiging.
  const invitation = await getValidInvitation(token);

  if (!invitation) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
          <CardDescription>Uitnodiging ongeldig</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>
            Deze uitnodiging is ongeldig of verlopen. Neem contact op met de
            beheerder voor een nieuwe uitnodiging.
          </p>
          <Link
            href="/inloggen"
            className="mt-4 inline-block text-foreground hover:underline"
          >
            Naar inloggen
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <RegisterForm
      invitationToken={token}
      invitationEmail={invitation.email}
    />
  );
}
