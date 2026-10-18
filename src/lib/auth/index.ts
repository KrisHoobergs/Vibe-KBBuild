import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getConfig } from "@/lib/config";
import { createProfileForUser, getProfileById } from "@/lib/db/repositories/profiles";
import type { Profile } from "@/types";
import { localAuth } from "./local";
import { supabaseAuth } from "./supabase";
import type { AuthDriver, Identiteit } from "./types";

// Toegang tot de data loopt niet meer via RLS maar via deze checks. Elke
// geëxporteerde functie in een "use server"-bestand is ook als server action
// aanroepbaar, dus elke zo'n functie controleert zelf wie er ingelogd is.

export function getAuthDriver(): AuthDriver {
  return getConfig().auth.driver === "local" ? localAuth : supabaseAuth;
}

/** Wie is ingelogd (één keer per request opgehaald). */
export const getIdentity = cache(async (): Promise<Identiteit | null> => {
  // Alles wat van de ingelogde gebruiker afhangt, wordt per request gerenderd
  // (nooit statisch tijdens de build, waar geen database beschikbaar is).
  await connection();
  return getAuthDriver().getIdentity();
});

/** Het profiel van de ingelogde gebruiker, of null. */
export const getCurrentUser = cache(async (): Promise<Profile | null> => {
  const identiteit = await getIdentity();
  if (!identiteit) return null;
  const profiel = await getProfileById(identiteit.userId);
  if (profiel || getAuthDriver().kind !== "local" || !identiteit.email) return profiel;

  // Eigen login: account zonder profiel (het aanmaken na registratie mislukte).
  await createProfileForUser({
    id: identiteit.userId,
    email: identiteit.email,
    displayName: identiteit.email.split("@")[0],
  });
  return getProfileById(identiteit.userId);
});

/** Voor pagina's: stuurt door naar inloggen als er niemand (met profiel) ingelogd is. */
export async function requireUser(): Promise<Profile> {
  const user = await getCurrentUser();
  if (!user) redirect("/inloggen");
  return user;
}

/** Voor beheerpagina's: niet-beheerders gaan terug naar de artikelen. */
export async function requireAdmin(): Promise<Profile> {
  const user = await requireUser();
  if (!user.is_admin) redirect("/artikelen");
  return user;
}

export const NIET_INGELOGD = { success: false, error: "Niet ingelogd" } as const;
export const GEEN_BEHEERDER = { success: false, error: "Geen beheerdersrechten" } as const;
