"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { success: false, error: "Ongeldig e-mailadres of wachtwoord" };
  }

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
    const supabase = await createClient();
    const { data: invitation } = await supabase
      .from("invitations")
      .select("*")
      .eq("token", invitationToken)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!invitation) {
      return { success: false, error: "Uitnodiging is ongeldig of verlopen" };
    }

    if (invitation.email !== parsed.data.email) {
      return { success: false, error: "E-mailadres komt niet overeen met de uitnodiging" };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: parsed.data.display_name,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Mark invitation as accepted
  if (invitationToken) {
    await supabase
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("token", invitationToken);
  }

  redirect("/artikelen");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
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

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/auth/callback`,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
