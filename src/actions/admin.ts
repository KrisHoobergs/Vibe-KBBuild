"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Invitation, Profile } from "@/types";

export async function inviteUser(email: string): Promise<ActionResult<Invitation>> {
  const supabase = await createClient();

  // Check if current user is admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Niet ingelogd" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return { success: false, error: "Geen beheerdersrechten" };
  }

  // Check if user already exists
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (existingProfile) {
    return { success: false, error: "Deze gebruiker bestaat al" };
  }

  // Check if invitation already exists
  const { data: existingInvite } = await supabase
    .from("invitations")
    .select("id")
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (existingInvite) {
    return { success: false, error: "Er is al een actieve uitnodiging voor dit e-mailadres" };
  }

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      email,
      invited_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/beheer/gebruikers");
  return { success: true, data };
}

export async function getUsers(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getInvitations(): Promise<Invitation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invitations")
    .select("*")
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/beheer/gebruikers");
  return { success: true };
}
