import Link from "next/link";
import { connection } from "next/server";
import { getAuthDriver } from "@/lib/auth";
import { getValidPasswordReset } from "@/lib/db/repositories/password-resets";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PasswordResetPage({ params }: Props) {
  await connection();
  const { token } = await params;

  // Alleen bij de eigen login; Supabase-installaties herstellen via e-mail.
  const herstel = getAuthDriver().setPassword ? await getValidPasswordReset(token) : null;

  if (!herstel) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
          <CardDescription>Herstellink ongeldig</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>
            Deze herstellink is ongeldig, al gebruikt of verlopen. Vraag de beheerder om een nieuwe
            link.
          </p>
          <Link href="/inloggen" className="mt-4 inline-block text-foreground hover:underline">
            Naar inloggen
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <NewPasswordForm token={token} email={herstel.email} />;
}
