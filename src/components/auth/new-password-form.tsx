"use client";

import { useState } from "react";
import { setNewPassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

interface NewPasswordFormProps {
  token: string;
  email: string;
}

export function NewPasswordForm({ token, email }: NewPasswordFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await setNewPassword(token, formData);
    // Bij succes stuurt de action door naar de inlogpagina.
    if (!result.success) {
      setError(result.error ?? "Er is een fout opgetreden");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
        <CardDescription>Nieuw wachtwoord instellen voor {email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">Nieuw wachtwoord</Label>
            <Input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Herhaal het wachtwoord</Label>
            <Input id="confirm" name="confirm" type="password" required minLength={6} autoComplete="new-password" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Bezig..." : "Wachtwoord opslaan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
