"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, GEEN_BEHEERDER } from "@/lib/auth";
import { listProfiles, profileExistsWithEmail } from "@/lib/db/repositories/profiles";
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

  const adres = email.trim();
  if (!adres) {
    return { success: false, error: "E-mailadres is verplicht" };
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
