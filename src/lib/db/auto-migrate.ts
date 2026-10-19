import { leesConfig } from "@/lib/config";
import { maakKysely } from "./connection";
import { assertGeenSupabaseDatabase } from "./guard";
import { migreer } from "./migrate";
import { postgresMigraties } from "./migrations/postgres";

// Migraties voor installaties zonder Supabase: via `npm run db:migrate` of bij
// het opstarten (DB_AUTO_MIGRATE=true, zie src/instrumentation.ts).
// Geen "server-only": ook scripts/db-migrate.mts gebruikt dit.

const POGINGEN = 3;
const WACHTTIJDEN_MS = [2_000, 5_000];

/**
 * Fouten waarbij opnieuw proberen zin heeft: de database is (nog) niet
 * bereikbaar. ENOTFOUND hoort erbij: na een herstart van Docker kan de app
 * starten voor de databasecontainer zijn netwerknaam heeft.
 */
export function isVerbindingsfout(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown };
  const code = typeof e?.code === "string" ? e.code : "";
  const tekst = typeof e?.message === "string" ? e.message : "";
  return (
    [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENOTFOUND",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "57P01",
      "57P03",
    ].includes(code) || /timeout|terminated|ECONNRESET/i.test(tekst)
  );
}

export async function voerMigratiesUit(log: (bericht: string) => void = console.log): Promise<string[]> {
  const config = leesConfig();
  if (config.auth.driver === "supabase") {
    throw new Error(
      "Geweigerd: deze installatie gebruikt Supabase. Supabase-migraties gaan handmatig (supabase/migrations)."
    );
  }
  if (config.db.dialect === "postgres") assertGeenSupabaseDatabase(config.db.url);
  // TIJDELIJK (fase 3): de SQL Server-migraties komen in een volgende stap.
  if (config.db.dialect === "mssql") throw new Error("SQL Server-migraties volgen in een volgende stap");

  for (let poging = 1; ; poging++) {
    // Eén verbinding, met ruim de tijd: bij het opstarten kan de database
    // nog slapen (bv. Neon) en eerst moeten ontwaken.
    const { db } = maakKysely({ ...config.db, poolMax: 1 }, { verbindingsTimeoutMs: 30_000 });
    try {
      return await migreer(db, config.db.dialect, postgresMigraties, log);
    } catch (error) {
      if (poging >= POGINGEN || !isVerbindingsfout(error)) throw error;
      log(`database niet bereikbaar (poging ${poging} van ${POGINGEN}), opnieuw proberen …`);
      await new Promise((r) => setTimeout(r, WACHTTIJDEN_MS[poging - 1] ?? 5_000));
    } finally {
      await db.destroy();
    }
  }
}
