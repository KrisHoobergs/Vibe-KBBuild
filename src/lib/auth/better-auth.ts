import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { betterAuthOpties } from "./better-auth-opties";

// De Better Auth-instantie van een installatie met eigen login. Lui aangemaakt
// (pas bij het eerste gebruik) en één per serverproces.

function maak() {
  const config = getConfig();
  if (!config.secret || !config.siteUrl) {
    throw new Error("Eigen login vraagt BETTER_AUTH_SECRET en SITE_URL");
  }
  return betterAuth({
    ...betterAuthOpties(getDb(), { secret: config.secret, baseURL: config.siteUrl, dialect: config.db.dialect }),
    // Zet de sessiecookies ook bij aanroepen vanuit server actions. Moet als laatste.
    plugins: [nextCookies()],
  });
}

const globaal = globalThis as unknown as { __kbBetterAuth?: ReturnType<typeof maak> };

export function getBetterAuth() {
  globaal.__kbBetterAuth ??= maak();
  return globaal.__kbBetterAuth;
}
