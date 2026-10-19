import { leesConfig } from "@/lib/config";
import { maakKysely } from "./connection";
import { assertGeenSupabaseDatabase } from "./guard";
import { migreer } from "./migrate";
import { mssqlMigraties } from "./migrations/mssql";
import { postgresMigraties } from "./migrations/postgres";

// Migraties voor installaties zonder Supabase: via `npm run db:migrate` of bij
// het opstarten (DB_AUTO_MIGRATE=true, zie src/instrumentation.ts).
// Geen "server-only": ook scripts/db-migrate.mts gebruikt dit.

const POGINGEN = 3;
const WACHTTIJDEN_MS = [2_000, 5_000];

// Foutcodes waarbij de database (nog) niet bereikbaar is. De laatste vier
// komen alleen van tedious (SQL Server): socketfout, verbindingstimeout,
// verbinding gesloten tijdens het opzetten, instantie niet gevonden (SQL Browser).
const VERBINDINGSCODES = [
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "57P01",
  "57P03",
  "ESOCKET",
  "ETIMEOUT",
  "ECLOSE",
  "EINSTLOOKUP",
];

/**
 * Fouten waarbij opnieuw proberen zin heeft: de database is (nog) niet
 * bereikbaar. ENOTFOUND hoort erbij: na een herstart van Docker kan de app
 * starten voor de databasecontainer zijn netwerknaam heeft.
 *
 * SQL Server: Kysely geeft meerdere serverfouten als array; elke fout telt.
 * tedious markeert tijdelijke fouten met isTransient. "script upgrade mode"
 * (Msg 18401) is een SQL Server-container die nog aan het opstarten is. Een
 * gewone aanmeldfout (ELOGIN, verkeerd wachtwoord) faalt meteen.
 * Postgres geeft nooit een array, dus daar blijft de controle dezelfde.
 */
export function isVerbindingsfout(error: unknown): boolean {
  const fouten: unknown[] = Array.isArray(error) ? error : [error];
  return fouten.some((f) => {
    const e = f as { code?: unknown; message?: unknown; isTransient?: unknown } | null | undefined;
    const code = typeof e?.code === "string" ? e.code : "";
    const tekst = typeof e?.message === "string" ? e.message : "";
    return (
      VERBINDINGSCODES.includes(code) ||
      e?.isTransient === true ||
      /timeout|terminated|ECONNRESET|script upgrade mode/i.test(tekst)
    );
  });
}

export async function voerMigratiesUit(log: (bericht: string) => void = console.log): Promise<string[]> {
  const config = leesConfig();
  if (config.auth.driver === "supabase") {
    throw new Error(
      "Geweigerd: deze installatie gebruikt Supabase. Supabase-migraties gaan handmatig (supabase/migrations)."
    );
  }
  if (config.db.dialect === "postgres") assertGeenSupabaseDatabase(config.db.url);
  const migraties = config.db.dialect === "mssql" ? mssqlMigraties : postgresMigraties;

  for (let poging = 1; ; poging++) {
    // Eén verbinding, met ruim de tijd: bij het opstarten kan de database
    // nog slapen (bv. Neon) en eerst moeten ontwaken. SQL Server: een query
    // mag 300 s duren (wachten op de migratielock, full-text-DDL); Postgres
    // gebruikt de request-timeout niet.
    const { db } = maakKysely(
      { ...config.db, poolMax: 1 },
      { verbindingsTimeoutMs: 30_000, requestTimeoutMs: 300_000 }
    );
    try {
      return await migreer(db, config.db.dialect, migraties, log);
    } catch (error) {
      if (poging >= POGINGEN || !isVerbindingsfout(error)) throw error;
      log(`database niet bereikbaar (poging ${poging} van ${POGINGEN}), opnieuw proberen …`);
      await new Promise((r) => setTimeout(r, WACHTTIJDEN_MS[poging - 1] ?? 5_000));
    } finally {
      await db.destroy();
    }
  }
}
