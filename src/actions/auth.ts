"use server";

import { redirect } from "next/navigation";
import { getAuthDriver } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getValidInvitation, markInvitationAccepted } from "@/lib/db/repositories/invitations";
import {
  getValidPasswordReset,
  markPasswordResetUsed,
  revokeOpenPasswordResets,
} from "@/lib/db/repositories/password-resets";
import { hasAnyAccount } from "@/lib/db/repositories/profiles";
import { signInSchema, signUpSchema, resetPasswordSchema, newPasswordSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/types";

/**
 * Mag iemand zonder uitnodiging registreren? Bij de eigen login met
 * REGISTRATIE=uitnodiging alleen de allereerste gebruiker (die wordt beheerder).
 * Supabase-installaties: open, zoals voorheen.
 */
export async function registratieZonderUitnodigingToegestaan(): Promise<boolean> {
  const { auth } = getConfig();
  if (auth.driver !== "local" || auth.registratie === "open") return true;
  return !(await hasAnyAccount());
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const rawData = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = signInSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const result = await getAuthDriver().signIn(parsed.data.email, parsed.data.password);
  if (!result.success) return result;

  redirect("/artikelen");
}

export async function signUp(
  formData: FormData,
  invitationToken?: string
): Promise<ActionResult> {
  const rawData = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    display_name: formData.get("display_name") as string,
  };

  const parsed = signUpSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  // Verify invitation if token provided
  if (invitationToken) {
    let invitation: Awaited<ReturnType<typeof getValidInvitation>>;
    try {
      invitation = await getValidInvitation(invitationToken);
    } catch (error) {
      console.error("Uitnodiging controleren mislukt:", error);
      return { success: false, error: "Er ging iets mis, probeer het later opnieuw" };
    }

    if (!invitation) {
      return { success: false, error: "Uitnodiging is ongeldig of verlopen" };
    }

    if (invitation.email.toLowerCase() !== parsed.data.email.toLowerCase()) {
      return { success: false, error: "E-mailadres komt niet overeen met de uitnodiging" };
    }
  } else if (!(await registratieZonderUitnodigingToegestaan())) {
    return { success: false, error: "Registreren kan alleen met een uitnodiging van de beheerder" };
  }

  const result = await getAuthDriver().signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: parsed.data.display_name,
  });
  if (!result.success) return result;

  // Mark invitation as accepted. Het account bestaat dan al: een fout hier
  // mag de registratie niet laten mislukken.
  if (invitationToken) {
    try {
      await markInvitationAccepted(invitationToken);
    } catch (error) {
      console.error("Uitnodiging als gebruikt markeren mislukt:", error);
    }
  }

  redirect("/artikelen");
}

export async function signOut(): Promise<void> {
  await getAuthDriver().signOut();
  redirect("/inloggen");
}

export async function resetPassword(formData: FormData): Promise<ActionResult> {
  const rawData = {
    email: formData.get("email") as string,
  };

  const parsed = resetPasswordSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  return getAuthDriver().requestPasswordReset(parsed.data.email);
}

/** Nieuw wachtwoord instellen met een herstellink van de beheerder (eigen login). */
export async function setNewPassword(token: string, formData: FormData): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const driver = getAuthDriver();
  if (!driver.setPassword) {
    return { success: false, error: "Wachtwoord herstellen gaat bij deze installatie via e-mail" };
  }

  const herstel = await getValidPasswordReset(token);
  if (!herstel) {
    return { success: false, error: "Deze herstellink is ongeldig, al gebruikt of verlopen" };
  }

  // Eerst de link verbruiken: zo werkt hij gegarandeerd maar één keer.
  if (!(await markPasswordResetUsed(token))) {
    return { success: false, error: "Deze herstellink is ongeldig, al gebruikt of verlopen" };
  }

  const resultaat = await driver.setPassword(herstel.userId, parsed.data.password);
  if (!resultaat.success) return resultaat;

  // Eventuele andere (oudere) links voor deze gebruiker werken nu ook niet meer.
  await revokeOpenPasswordResets(herstel.userId);

  redirect("/inloggen?hersteld=1");
}
