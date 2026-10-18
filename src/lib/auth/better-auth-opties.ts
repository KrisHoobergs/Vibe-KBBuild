import type { BetterAuthOptions } from "better-auth";
import type { Kysely } from "kysely";

// Instellingen van de eigen login (Better Auth). Apart bestand zonder
// "server-only", zodat ook scripts (schemacontrole) exact dezelfde instellingen
// gebruiken als de app.

/** Sessies blijven 30 dagen geldig en worden hooguit één keer per dag verlengd. */
const SESSIE_DUUR_S = 60 * 60 * 24 * 30;
const SESSIE_VERLENGEN_NA_S = 60 * 60 * 24;

export function betterAuthOpties(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  opties: { secret: string; baseURL: string; dialect: "postgres" | "mssql" }
) {
  return {
    appName: "Knowledge Build",
    secret: opties.secret,
    baseURL: opties.baseURL,
    // Dezelfde Kysely-verbinding als de rest van de app; met echte transacties.
    database: { db, type: opties.dialect, transaction: true },
    emailAndPassword: {
      enabled: true,
      // Zelfde regel als het registratieformulier (src/lib/validations/auth.ts).
      minPasswordLength: 6,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    // Eigen tabelnamen: "user" is een gereserveerd woord in Postgres en SQL Server.
    user: { modelName: "auth_users" },
    session: { modelName: "auth_sessions", expiresIn: SESSIE_DUUR_S, updateAge: SESSIE_VERLENGEN_NA_S },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" },
    advanced: { database: { generateId: "uuid" } },
  } satisfies BetterAuthOptions;
}
