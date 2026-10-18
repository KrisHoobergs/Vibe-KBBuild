import type { ActionResult } from "@/types";

export type Identiteit = { userId: string; email: string | null };

/**
 * Wat de app van een login-systeem nodig heeft. Supabase-installaties gebruiken
 * Supabase Auth; andere installaties een eigen login in hun database.
 */
export interface AuthDriver {
  kind: "supabase" | "local";
  /** "email": het login-systeem mailt zelf een herstellink; "beheerderslink": de beheerder maakt er een. */
  herstel: "email" | "beheerderslink";
  /** Wie is ingelogd (sessie gecontroleerd), of null. */
  getIdentity(): Promise<Identiteit | null>;
  signIn(email: string, password: string): Promise<ActionResult>;
  /** Maakt het account én het profiel aan (bij Supabase via de databasetrigger). */
  signUp(input: { email: string; password: string; displayName: string }): Promise<ActionResult>;
  signOut(): Promise<void>;
  /** Stuurt een herstelmail (alleen waar het login-systeem zelf mailt). */
  requestPasswordReset(email: string): Promise<ActionResult>;
  /** Zet een nieuw wachtwoord en beëindigt alle sessies (alleen eigen login). */
  setPassword?(userId: string, nieuwWachtwoord: string): Promise<ActionResult>;
}
