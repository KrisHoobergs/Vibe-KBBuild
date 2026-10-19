import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DbConfig, PostgresDbConfig } from "@/lib/config";
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

export type PoolOpties = { verbindingsTimeoutMs?: number; idleTimeoutMs?: number };

export function maakPostgresPool(config: PostgresDbConfig, opties: PoolOpties = {}) {
  const pool = new pg.Pool({
    connectionString: config.url,
    ssl: config.ssl,
    max: config.poolMax,
    // Standaard kort (scripts, gezondheidscheck). De app zelf houdt
    // verbindingen langer open (zie getDb), zodat een klik na even lezen geen
    // nieuwe verbinding naar de database hoeft op te zetten.
    idleTimeoutMillis: opties.idleTimeoutMs ?? 5_000,
    // Ruim genoeg voor een database die eerst moet ontwaken (bv. Neon na
    // een paar minuten zonder gebruik).
    connectionTimeoutMillis: opties.verbindingsTimeoutMs ?? 15_000,
    types: pgTypes,
    application_name: "kbbuild",
  });
  // Een ongebruikte verbinding die de database of pooler sluit, geeft een
  // 'error' op de pool. Zonder luisteraar zou dat het hele proces stoppen.
  pool.on("error", (error) => console.error("[db] ongebruikte verbinding verbroken:", error.message));
  return pool;
}

export function maakKysely(
  config: DbConfig,
  opties: PoolOpties = {}
): { db: Kysely<Database>; pool: pg.Pool } {
  // TIJDELIJK (fase 3): de SQL Server-verbinding komt in de volgende stap.
  if (config.dialect === "mssql") throw new Error("SQL Server-verbinding volgt in een volgende stap");
  const pool = maakPostgresPool(config, opties);
  return { db: new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }), pool };
}
