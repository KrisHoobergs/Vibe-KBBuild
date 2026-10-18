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
    const { db, pool } = maakKysely(getConfig().db);
    // Op Vercel (Fluid compute) sluit dit ongebruikte verbindingen netjes af
    // voordat een functie-instantie wordt bevroren.
    if (process.env.VERCEL) attachDatabasePool(pool);
    globaal.__kbDb = db;
  }
  return globaal.__kbDb;
}
