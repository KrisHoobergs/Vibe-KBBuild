import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DbConfig } from "@/lib/config";
import type { Database } from "./schema";

// Bouwt de Kysely-instantie voor een configuratie. Geen "server-only" hier: ook
// de scripts in scripts/ maken zo hun verbinding.

// COUNT(*) en andere int8-waarden komen standaard als string uit pg; de app
// telt alleen kleine aantallen, dus een gewone number volstaat.
const pgTypes = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === 20) return (v: string) => Number(v);
    return pg.types.getTypeParser(oid, format);
  },
};

export function maakPostgresPool(config: DbConfig) {
  return new pg.Pool({
    connectionString: config.url,
    ssl: config.ssl,
    max: config.poolMax,
    // Kort houden: serverless functies blijven niet lang leven, en de
    // Supabase-pooler heeft een beperkt aantal verbindingen.
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    types: pgTypes,
    application_name: "kbbuild",
  });
}

export function maakKysely(config: DbConfig): { db: Kysely<Database>; pool: pg.Pool } {
  const pool = maakPostgresPool(config);
  return { db: new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }), pool };
}
