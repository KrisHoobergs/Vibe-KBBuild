import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuthDriver } from "./types";

// Supabase Auth: accounts in auth.users, sessie in cookies (@supabase/ssr).
// Het profiel wordt bij registratie aangemaakt door de databasetrigger
// handle_new_user (eerste gebruiker = admin).

export const supabaseAuth: AuthDriver = {
  kind: "supabase",

  async getIdentity() {
    const supabase = await createClient();
    // De proxy heeft de sessie al gecontroleerd en ververst; hier volstaat een
    // controle van de JWT (lokaal, of via de Auth-server bij een oude sleutel).
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return null;
    return { userId: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
  },

  async signIn(email, password) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: "Ongeldig e-mailadres of wachtwoord" };
    return { success: true };
  },

  async signUp({ email, password, displayName }) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut();
  },

  async requestPasswordReset(email) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/auth/callback`,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  },
};
