import { leesConfig } from "@/lib/config";
import { maakKysely } from "./connection";
import { assertGeenSupabaseDatabase } from "./guard";
import { migreer } from "./migrate";
import { postgresMigraties } from "./migrations/postgres";

// Migraties voor installaties zonder Supabase: via `npm run db:migrate` of bij
// het opstarten (DB_AUTO_MIGRATE=true, zie src/instrumentation.ts).
// Geen "server-only": ook scripts/db-migrate.mts gebruikt dit.

export async function voerMigratiesUit(log: (bericht: string) => void = console.log): Promise<string[]> {
  const config = leesConfig();
  if (config.auth.driver === "supabase") {
    throw new Error(
      "Geweigerd: deze installatie gebruikt Supabase. Supabase-migraties gaan handmatig (supabase/migrations)."
    );
  }
  assertGeenSupabaseDatabase(config.db.url);

  const { db } = maakKysely(config.db);
  try {
    return await migreer(db, config.db.dialect, postgresMigraties, log);
  } finally {
    await db.destroy();
  }
}
