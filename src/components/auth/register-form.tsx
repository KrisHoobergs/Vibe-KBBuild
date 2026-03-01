"use client";

import { useState } from "react";
import { signUp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

interface RegisterFormProps {
  invitationToken?: string;
  invitationEmail?: string;
}

export function RegisterForm({ invitationToken, invitationEmail }: RegisterFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await signUp(formData, invitationToken);
    if (!result.success) {
      setError(result.error ?? "Er is een fout opgetreden");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
        <CardDescription>
          {invitationToken
            ? "Je bent uitgenodigd! Maak een account aan."
            : "Maak een nieuw account aan"}
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
            <Label htmlFor="display_name">Naam</Label>
            <Input
              id="display_name"
              name="display_name"
              type="text"
              placeholder="Volledige naam"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mailadres</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="naam@bedrijf.nl"
              required
              autoComplete="email"
              defaultValue={invitationEmail}
              readOnly={!!invitationEmail}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Wachtwoord</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Minimaal 6 tekens"
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Account aanmaken..." : "Account aanmaken"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
