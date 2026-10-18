import Link from "next/link";
import { connection } from "next/server";
import { getAuthDriver } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

export default async function ForgotPasswordPage() {
  await connection();

  // Supabase mailt zelf een herstellink; bij de eigen login is er geen
  // mailserver en maakt de beheerder een link.
  if (getAuthDriver().herstel === "email") return <ForgotPasswordForm />;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
        <CardDescription>Wachtwoord vergeten?</CardDescription>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        <p>
          Vraag de beheerder om een herstellink. Daarmee stel je zelf een nieuw wachtwoord in.
        </p>
      </CardContent>
      <CardFooter className="justify-center">
        <Link href="/inloggen" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          Terug naar inloggen
        </Link>
      </CardFooter>
    </Card>
  );
}
