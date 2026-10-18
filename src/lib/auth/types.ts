import type { ActionResult } from "@/types";

export type Identiteit = { userId: string; email: string | null };

/**
 * Wat de app van een login-systeem nodig heeft. Supabase-installaties gebruiken
 * Supabase Auth; andere installaties (later) een eigen login in hun database.
 */
export interface AuthDriver {
  kind: "supabase" | "local";
  /** Wie is ingelogd (sessie gecontroleerd), of null. */
  getIdentity(): Promise<Identiteit | null>;
  signIn(email: string, password: string): Promise<ActionResult>;
  /** Maakt het account aan; het profiel ontstaat in de database (trigger of hook). */
  signUp(input: { email: string; password: string; displayName: string }): Promise<ActionResult>;
  signOut(): Promise<void>;
  /** Stuurt een herstelmail (alleen waar het login-systeem zelf mailt). */
  requestPasswordReset(email: string): Promise<ActionResult>;
}
