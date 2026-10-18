import Link from "next/link";
import { connection } from "next/server";
import { registratieZonderUitnodigingToegestaan } from "@/actions/auth";
import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

export default async function RegisterPage() {
  await connection();

  if (await registratieZonderUitnodigingToegestaan()) return <RegisterForm />;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
        <CardDescription>Registreren op uitnodiging</CardDescription>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        <p>
          Je kunt alleen een account aanmaken met een uitnodiging. Vraag de beheerder om een
          uitnodigingslink.
        </p>
        <Link href="/inloggen" className="mt-4 inline-block text-foreground hover:underline">
          Naar inloggen
        </Link>
      </CardContent>
    </Card>
  );
}
