import "server-only";
import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { createProfileForUser } from "@/lib/db/repositories/profiles";
import { getBetterAuth } from "./better-auth";
import type { AuthDriver } from "./types";

// Eigen login (Better Auth): accounts en sessies in de eigen database. Alle
// aanroepen gaan rechtstreeks via auth.api vanuit server actions; de HTTP-
// routes van Better Auth zijn grotendeels dicht (zie app/api/auth/[...all]).

// Better Auth begrenst inlogpogingen alleen via HTTP, niet bij rechtstreekse
// aanroepen. Daarom hier een eigen begrenzing (per serverproces), op drie
// niveaus per kwartier:
// - IP + e-mailadres: 5 mislukte pogingen (gewoon verkeerd typen);
// - IP over alle accounts: 30 (één bron die wachtwoorden uitprobeert);
// - e-mailadres over alle IP's: 50 (verspreide aanval op één account).
// Zo kan iemand een ander niet met 5 pogingen buitensluiten. Het IP komt uit
// x-forwarded-for (zie clientIp). Dat is alleen betrouwbaar als een proxy die
// header zet (Vercel, Caddy, de nginx- en IIS-voorbeelden in de handleiding):
// Next.js vult hem alleen met het adres van de verbinding als de client hem
// níet meestuurt. Is poort 3000 rechtstreeks bereikbaar, dan kan een client
// zelf een IP kiezen en helpt alleen de limiet per e-mailadres.
const VENSTER_MS = 15 * 60 * 1000;
const LIMIET = { ipEmail: 5, ip: 30, email: 50 };
const MAX_SLEUTELS = 10_000;
const mislukt = new Map<string, { aantal: number; tot: number }>();

function aantalMislukt(sleutel: string): number {
  const stand = mislukt.get(sleutel);
  if (!stand) return 0;
  if (stand.tot < Date.now()) {
    mislukt.delete(sleutel);
    return 0;
  }
  return stand.aantal;
}

function registreerMislukt(sleutel: string) {
  const stand = mislukt.get(sleutel);
  if (!stand || stand.tot < Date.now()) {
    mislukt.delete(sleutel);
    mislukt.set(sleutel, { aantal: 1, tot: Date.now() + VENSTER_MS });
  } else {
    stand.aantal++;
  }
  if (mislukt.size > MAX_SLEUTELS) {
    // Eerst verlopen tellers weg, dan desnoods de oudste (Map houdt de volgorde bij).
    const nu = Date.now();
    for (const [k, v] of mislukt) if (v.tot < nu) mislukt.delete(k);
    for (const k of mislukt.keys()) {
      if (mislukt.size <= MAX_SLEUTELS) break;
      mislukt.delete(k);
    }
  }
}

/**
 * Het IP van de client: het **laatste** item van x-forwarded-for. Dat voegde
 * de dichtstbijzijnde proxy toe (nginx, IIS); eerdere items stuurt de client
 * zelf mee en zijn dus vrij te kiezen. Vercel en Caddy zetten er maar één.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const laatste = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  const ip = laatste || h.get("x-real-ip")?.trim();
  if (!ip) return "onbekend";
  // IIS zet er standaard de poort van de client achter ("1.2.3.4:51234", "[::1]:51234").
  return ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)?.[1] ?? ip.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1] ?? ip;
}

const FOUTEN_REGISTRATIE: Record<string, string> = {
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Er bestaat al een account met dit e-mailadres",
  INVALID_EMAIL: "Ongeldig e-mailadres",
  PASSWORD_TOO_SHORT: "Wachtwoord moet minstens 6 tekens bevatten",
  PASSWORD_TOO_LONG: "Wachtwoord is te lang (maximaal 128 tekens)",
};

export const localAuth: AuthDriver = {
  kind: "local",
  herstel: "beheerderslink",

  async getIdentity() {
    const sessie = await getBetterAuth().api.getSession({ headers: await headers() });
    if (!sessie) return null;
    return { userId: sessie.user.id, email: sessie.user.email };
  },

  async signIn(email, password) {
    const adres = email.trim().toLowerCase();
    const ip = await clientIp();
    const sleutels = { ipEmail: `ie:${ip}|${adres}`, ip: `i:${ip}`, email: `e:${adres}` };
    if (
      aantalMislukt(sleutels.ipEmail) >= LIMIET.ipEmail ||
      aantalMislukt(sleutels.ip) >= LIMIET.ip ||
      aantalMislukt(sleutels.email) >= LIMIET.email
    ) {
      return { success: false, error: "Te veel mislukte pogingen. Probeer het over een kwartier opnieuw." };
    }
    try {
      await getBetterAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
    } catch (error) {
      if (isAPIError(error)) {
        for (const sleutel of Object.values(sleutels)) registreerMislukt(sleutel);
        return { success: false, error: "Ongeldig e-mailadres of wachtwoord" };
      }
      throw error;
    }
    mislukt.delete(sleutels.ipEmail);
    return { success: true };
  },

  async signUp({ email, password, displayName }) {
    let gebruiker: { id: string; email: string };
    try {
      const resultaat = await getBetterAuth().api.signUpEmail({
        body: { email, password, name: displayName },
        headers: await headers(),
      });
      gebruiker = resultaat.user;
    } catch (error) {
      if (isAPIError(error)) {
        const code = String(error.body?.code ?? "");
        return { success: false, error: FOUTEN_REGISTRATIE[code] ?? "Registreren is mislukt" };
      }
      throw error;
    }
    // Het account bestaat nu; lukt het profiel hier niet, dan maakt
    // getCurrentUser het bij de volgende aanvraag alsnog aan.
    try {
      await createProfileForUser({ id: gebruiker.id, email: gebruiker.email, displayName });
    } catch (error) {
      console.error("Profiel aanmaken mislukt:", error);
    }
    return { success: true };
  },

  async signOut() {
    try {
      await getBetterAuth().api.signOut({ headers: await headers() });
    } catch (error) {
      // Geen (geldige) sessie meer: dan is er niets uit te loggen.
      if (!isAPIError(error)) throw error;
    }
  },

  async requestPasswordReset() {
    return { success: false, error: "Vraag de beheerder om een herstellink." };
  },

  async setPassword(userId, nieuwWachtwoord) {
    // Er is geen openbare API om zonder mail een wachtwoord te zetten; dit volgt
    // wat de admin-plugin van Better Auth intern doet (Better Auth 1.7).
    const ctx = await getBetterAuth().$context;
    const { minPasswordLength, maxPasswordLength } = ctx.password.config;
    if (nieuwWachtwoord.length < minPasswordLength) {
      return { success: false, error: `Wachtwoord moet minstens ${minPasswordLength} tekens bevatten` };
    }
    if (nieuwWachtwoord.length > maxPasswordLength) {
      return { success: false, error: `Wachtwoord is te lang (maximaal ${maxPasswordLength} tekens)` };
    }

    const hash = await ctx.password.hash(nieuwWachtwoord);
    const account = await ctx.internalAdapter.findCredentialAccount(userId);
    if (account) {
      await ctx.internalAdapter.updatePassword(userId, hash);
    } else {
      await ctx.internalAdapter.createAccount({ userId, providerId: "credential", accountId: userId, password: hash });
    }
    // Oude sessies (bv. op een gestolen toestel) zijn daarna ongeldig.
    await ctx.internalAdapter.deleteUserSessions(userId);
    return { success: true };
  },
};
