/**
 * Testomgeving voor de SQL Server-scripts (db:test:migraties:mssql,
 * db:mssql:controle -- --test, en later de andere mssql-tests).
 *
 * - Leest .env.local (bestaande omgevingsvariabelen gaan voor, zoals in CI).
 * - Wist DATABASE_URL (en de andere database-URL's) en elke MSSQL_* die geen
 *   MSSQL_TEST_* is, en zet daarna MSSQL_TEST_X om naar MSSQL_X. Zo raakt een
 *   test nooit een echte installatie, ook niet als .env.local die ooit bevat.
 * - Zet DB_DIALECT=mssql, eigen login, opslag in de database, een wegwerp-
 *   geheim en SITE_URL.
 * - assertMssqlTestdatabase: vraagt de database zelf of het een testdatabase
 *   is. De naam moet beginnen met kb_test, kennisbank_test, kb_pariteit of
 *   kennisbank_pariteit, ÉN de database moet de markering kb_testdatabase = 'ja'
 *   hebben (scripts/mssql/testdatabase.sql). Er is geen override.
 *
 * zetMssqlTestomgeving() moet lopen VÓÓR de eerste import van src/lib/db/* of
 * src/lib/config (getConfig en getDb lezen de omgeving één keer).
 *
 * Nooit serveradres, gebruiker of wachtwoord loggen.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { sql, type Kysely } from "kysely";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

/** Namen die een testdatabase mag hebben (hoofdletters maken niet uit). */
export const TESTDATABASE_NAAM = /^(kb|kennisbank)_(test|pariteit)/i;

export type MssqlTestDoel = "test" | "pariteit";

export function zetMssqlTestomgeving(doel: MssqlTestDoel = "test"): { database: string } {
  const envBestand = path.join(ROOT, ".env.local");
  if (existsSync(envBestand)) process.loadEnvFile(envBestand);

  const vereist = ["MSSQL_TEST_SERVER", "MSSQL_TEST_USER", "MSSQL_TEST_PASSWORD"];
  const ontbreekt = vereist.filter((k) => !process.env[k]);
  if (ontbreekt.length) {
    throw new Error(`Ontbreekt in .env.local of de omgeving: ${ontbreekt.join(", ")}`);
  }

  const test: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("MSSQL_TEST_") && v !== undefined) test[k.slice("MSSQL_TEST_".length)] = v;
  }

  // Alles weg wat naar een echte database kan wijzen.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("MSSQL_") && !k.startsWith("MSSQL_TEST_")) delete process.env[k];
  }
  for (const k of ["DATABASE_URL", "LOKALE_DATABASE_URL", "PROD_DATABASE_URL", "WERK_DATABASE_URL"]) {
    delete process.env[k];
  }

  const database =
    doel === "pariteit" ? (test.PARITEIT_DATABASE ?? "kb_pariteit") : (test.DATABASE ?? "kb_test");
  if (!TESTDATABASE_NAAM.test(database)) {
    throw new Error(`Geweigerd: ${database} is geen testdatabase (naam moet beginnen met kb_test of kennisbank_test)`);
  }

  // MSSQL_TEST_X → MSSQL_X (SERVER, PORT, INSTANCE, USER, PASSWORD, ENCRYPT,
  // TRUST_SERVER_CERT, CA, TLS_SERVERNAME, AUTH, DOMAIN, …).
  for (const [k, v] of Object.entries(test)) {
    if (k === "DATABASE" || k === "PARITEIT_DATABASE" || k.startsWith("FULLTEXT_")) continue;
    process.env[`MSSQL_${k}`] = v;
  }

  Object.assign(process.env, {
    DB_DIALECT: "mssql",
    MSSQL_DATABASE: database,
    AUTH_DRIVER: "local",
    STORAGE_DRIVER: "database",
    // Wegwerpgeheim: alleen voor deze testprocessen.
    BETTER_AUTH_SECRET: "test-geheim-alleen-voor-mssql-testscripts-0123456789",
    SITE_URL: "http://localhost:3001",
    DB_AUTO_MIGRATE: "false",
  });
  delete process.env.STORAGE_DIR;
  return { database };
}

export type TestdatabaseInfo = { naam: string | null; markering: string | null };

/** Waarom deze database GEEN testdatabase is, of null als ze het wel is. */
export function weigeringTestdatabase(info: TestdatabaseInfo): string | null {
  if (!info.naam || !TESTDATABASE_NAAM.test(info.naam)) {
    return `Geweigerd: database ${info.naam ?? "(onbekend)"} is geen testdatabase (naam moet beginnen met kb_test of kennisbank_test)`;
  }
  if (info.markering !== "ja") {
    return `Geweigerd: database ${info.naam} mist de markering kb_testdatabase = 'ja' (scripts/mssql/testdatabase.sql)`;
  }
  return null;
}

/** In de database zelf nagaan dat het een (gemarkeerde) testdatabase is. Gooit anders. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertMssqlTestdatabase(db: Kysely<any>): Promise<void> {
  const { rows } = await sql<TestdatabaseInfo & { sysadmin: number | null }>`
    SELECT DB_NAME() AS naam,
           CAST((SELECT value FROM sys.extended_properties
                 WHERE class = 0 AND name = N'kb_testdatabase') AS nvarchar(10)) AS markering,
           IS_SRVROLEMEMBER('sysadmin') AS sysadmin
  `.execute(db);
  const r = rows[0];
  const weigering = weigeringTestdatabase({ naam: r?.naam ?? null, markering: r?.markering ?? null });
  if (weigering) throw new Error(weigering);
  if (r?.sysadmin === 1) {
    console.warn("Let op: de testlogin is sysadmin; de tests bewijzen dan niet dat minimale rechten volstaan.");
  }
}

/**
 * Maakt de testdatabase helemaal leeg met scripts/mssql/leegmaken.sql (dat de
 * naam en de markering in T-SQL nog eens controleert). Buiten een transactie:
 * full-text-DDL mag daar niet in.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function maakMssqlTestdatabaseLeeg(db: Kysely<any>): Promise<void> {
  await assertMssqlTestdatabase(db);
  const tekst = readFileSync(path.join(ROOT, "scripts", "mssql", "leegmaken.sql"), "utf8");
  await sql.raw(tekst).execute(db);
}

/**
 * Wacht tot de full-text-index alle wijzigingen verwerkt heeft (CHANGE_TRACKING
 * AUTO werkt asynchroon). Zonder full-text-index: meteen klaar. Geeft de
 * wachttijd in ms.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function wachtOpZoekindex(db: Kysely<any>, maxMs = 60_000): Promise<number> {
  const start = Date.now();
  for (;;) {
    const { rows } = await sql<{ heeft_index: number | null; wachtend: number | null; vulstatus: number | null }>`
      SELECT CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableHasActiveFulltextIndex') AS int) AS heeft_index,
             CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableFulltextPendingChanges') AS int) AS wachtend,
             CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableFulltextPopulateStatus') AS int) AS vulstatus
    `.execute(db);
    const r = rows[0];
    if (!r?.heeft_index) return 0;
    if (r.wachtend === 0 && r.vulstatus === 0) return Date.now() - start;
    if (Date.now() - start > maxMs) {
      throw new Error(`Zoekindex na ${maxMs} ms nog niet bij (${JSON.stringify(r)})`);
    }
    await new Promise((res) => setTimeout(res, 250));
  }
}
