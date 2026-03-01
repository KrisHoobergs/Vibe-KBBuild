"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await resetPassword(formData);
    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error ?? "Er is een fout opgetreden");
    }
    setLoading(false);
  }

  if (success) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
          <CardDescription>E-mail verstuurd</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>
            Als er een account bestaat met dit e-mailadres, ontvang je een link
            om je wachtwoord te resetten.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/inloggen" className="text-sm hover:text-foreground transition-colors text-muted-foreground">
            Terug naar inloggen
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
        <CardDescription>
          Voer je e-mailadres in om je wachtwoord te resetten
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mailadres</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="naam@bedrijf.nl"
              required
              autoComplete="email"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Bezig met versturen..." : "Resetlink versturen"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <Link href="/inloggen" className="text-sm hover:text-foreground transition-colors text-muted-foreground">
          Terug naar inloggen
        </Link>
      </CardFooter>
    </Card>
  );
}
