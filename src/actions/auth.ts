"use server";

import { redirect } from "next/navigation";
import { getAuthDriver } from "@/lib/auth";
import { getValidInvitation, markInvitationAccepted } from "@/lib/db/repositories/invitations";
import { signInSchema, signUpSchema, resetPasswordSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/types";

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
