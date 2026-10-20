import "server-only";
import type { Kysely } from "kysely";
import { attachDatabasePool } from "@vercel/functions";
import { getConfig } from "@/lib/config";
import { maakKysely } from "./connection";
import type { Database } from "./schema";

export type { Database } from "./schema";

// Eén pool per serverproces. Op globalThis zodat hot reload in `next dev` niet
// bij elke wijziging een nieuwe pool opent.
const globaal = globalThis as unknown as { __kbDb?: Kysely<Database> };

export function getDb(): Kysely<Database> {
  if (!globaal.__kbDb) {
    // Zelf gehost: verbindingen een minuut openhouden, zodat een klik na even
    // lezen er geen nieuwe hoeft op te zetten (TLS en aanmelden). Op Vercel
    // niet: daar houdt attachDatabasePool de functie open (waitUntil) zolang
    // de idle-tijd loopt, en die tijd telt mee als gebruikt geheugen. Op Vercel
    // (Fluid compute) sluit attachDatabasePool ongebruikte verbindingen netjes
    // af voordat een functie-instantie wordt bevroren. attachDatabasePool kent
    // alleen pg (SQL Server wordt op Vercel toch geweigerd, zie config.ts).
    const { db, pgPool } = maakKysely(getConfig().db, {
      idleTimeoutMs: process.env.VERCEL ? 5_000 : 60_000,
    });
    if (process.env.VERCEL && pgPool) attachDatabasePool(pgPool);
    globaal.__kbDb = db;
  }
  return globaal.__kbDb;
}
