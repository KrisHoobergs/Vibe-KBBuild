"use server";

import { revalidatePath } from "next/cache";
import { getAuthDriver, getCurrentUser, GEEN_BEHEERDER } from "@/lib/auth";
import { insertPasswordReset } from "@/lib/db/repositories/password-resets";
import { getProfileById, listProfiles, profileExistsWithEmail } from "@/lib/db/repositories/profiles";
import {
  deleteInvitationById,
  hasActiveInvitationFor,
  insertInvitation,
  listInvitations,
} from "@/lib/db/repositories/invitations";
import type { ActionResult, Invitation, Profile } from "@/types";

// Alles hier is alleen voor beheerders: elke functie controleert dat zelf,
// want ze zijn ook rechtstreeks als server action aanroepbaar.

async function isBeheerder(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user?.is_admin;
}

export async function inviteUser(email: string): Promise<ActionResult<Invitation>> {
  const user = await getCurrentUser();
  if (!user?.is_admin) return GEEN_BEHEERDER;

  // Kleine letters, zoals de login-systemen e-mailadressen ook opslaan.
  const adres = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adres)) {
    return { success: false, error: "Ongeldig e-mailadres" };
  }

  try {
    if (await profileExistsWithEmail(adres)) {
      return { success: false, error: "Deze gebruiker bestaat al" };
    }

    if (await hasActiveInvitationFor(adres)) {
      return { success: false, error: "Er is al een actieve uitnodiging voor dit e-mailadres" };
    }

    const invitation = await insertInvitation(adres, user.id);
    revalidatePath("/beheer/gebruikers");
    return { success: true, data: invitation };
  } catch (error) {
    console.error("Uitnodigen mislukt:", error);
    return { success: false, error: "Uitnodiging aanmaken mislukt" };
  }
}

export async function getUsers(): Promise<Profile[]> {
  if (!(await isBeheerder())) return [];
  return listProfiles();
}

export async function getInvitations(): Promise<Invitation[]> {
  if (!(await isBeheerder())) return [];
  return listInvitations();
}

/**
 * Herstellink voor een gebruiker (alleen bij de eigen login). De beheerder geeft
 * de link zelf door; hij werkt één keer en is 7 dagen geldig.
 */
export async function createPasswordResetLink(
  userId: string
): Promise<ActionResult<{ token: string; expiresAt: string }>> {
  const user = await getCurrentUser();
  if (!user?.is_admin) return GEEN_BEHEERDER;
  if (getAuthDriver().herstel !== "beheerderslink") {
    return { success: false, error: "Bij deze installatie herstellen gebruikers hun wachtwoord via e-mail" };
  }

  try {
    if (!(await getProfileById(userId))) {
      return { success: false, error: "Gebruiker niet gevonden" };
    }
    const { token, expiresAt } = await insertPasswordReset(userId, user.id);
    return { success: true, data: { token, expiresAt: expiresAt.toISOString() } };
  } catch (error) {
    console.error("Herstellink maken mislukt:", error);
    return { success: false, error: "Herstellink maken mislukt" };
  }
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  if (!(await isBeheerder())) return GEEN_BEHEERDER;

  try {
    await deleteInvitationById(id);
  } catch (error) {
    console.error("Uitnodiging intrekken mislukt:", error);
    return { success: false, error: "Intrekken mislukt" };
  }

  revalidatePath("/beheer/gebruikers");
  return { success: true };
}
