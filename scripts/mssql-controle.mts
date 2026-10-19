/**
 * Controle van een SQL Server voor de kennisbank. ALLEEN LEZEN.
 *
 *   npm run db:mssql:controle             de installatie zelf (MSSQL_* uit de
 *                                         omgeving of .env.local, DB_DIALECT=mssql)
 *   npm run db:mssql:controle -- --test   de testdatabase (MSSQL_TEST_*)
 *
 * Toont: versie en editie, NOCOUNT, collatie, READ_COMMITTED_SNAPSHOT,
 * Full-Text Search en de index, de rechten van de login en de versleuteling
 * van de verbinding, plus wat dat betekent voor de app (zoals /status, maar
 * met versie en collatie). Toont nooit serveradres, gebruiker of wachtwoord.
 * Geeft exitcode 1 bij een fataal probleem.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { sql } from "kysely";
import { zetMssqlTestomgeving } from "./lib/mssql-testomgeving.mjs";

const test = process.argv.includes("--test");
if (test) {
  zetMssqlTestomgeving();
} else {
  const env = path.resolve(import.meta.dirname, "..", ".env.local");
  if (existsSync(env)) process.loadEnvFile(env);
}

const { leesConfig } = await import("../src/lib/config");
const { maakKysely } = await import("../src/lib/db/connection");
const { leesMssqlControles, beoordeelMssqlControles } = await import("../src/lib/db/mssql-controles");

const config = leesConfig();
if (config.db.dialect !== "mssql") {
  console.error("Deze controle is voor SQL Server: zet DB_DIALECT=mssql en de MSSQL_*-variabelen (of gebruik --test).");
  process.exit(1);
}

const VERSIES: Record<number, string> = { 13: "2016", 14: "2017", 15: "2019", 16: "2022", 17: "2025" };
const EDITIES: Record<number, string> = {
  2: "Standard",
  3: "Enterprise/Developer",
  4: "Express",
  5: "Azure SQL Database",
  8: "Azure SQL Managed Instance",
};
const regel = (label: string, waarde: string) => console.log(`  ${label.padEnd(24)} ${waarde}`);
const janee = (v: unknown) => (v === 1 || v === true ? "ja" : v === 0 || v === false ? "nee" : "onbekend");

const { db } = maakKysely({ ...config.db, poolMax: 1 }, { requestTimeoutMs: 60_000 });
let fataal = false;
try {
  const c = await leesMssqlControles(db);
  const oordeel = beoordeelMssqlControles(c);

  const { rows: info } = await sql<{
    database: string;
    nederlands: number;
    minuten_lokaal_min_utc: number;
    standaardschema: string | null;
    migraties: string | null;
  }>`
    SELECT DB_NAME() AS "database",
           (SELECT COUNT(*) FROM sys.fulltext_languages WHERE lcid = 1043) AS nederlands,
           DATEDIFF(MINUTE, GETUTCDATE(), GETDATE()) AS minuten_lokaal_min_utc,
           SCHEMA_NAME() AS standaardschema,
           CASE WHEN OBJECT_ID(N'dbo.kb_migrations', N'U') IS NULL THEN NULL ELSE N'?' END AS migraties
  `.execute(db);
  const i = info[0];

  const { rows: rechten } = await sql<Record<string, number | null>>`
    SELECT IS_SRVROLEMEMBER('sysadmin') AS sysadmin,
           IS_ROLEMEMBER('db_owner') AS db_owner,
           IS_ROLEMEMBER('db_ddladmin') AS db_ddladmin,
           IS_ROLEMEMBER('db_datareader') AS db_datareader,
           IS_ROLEMEMBER('db_datawriter') AS db_datawriter,
           HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS create_table,
           HAS_PERMS_BY_NAME(N'dbo', 'SCHEMA', 'ALTER') AS alter_schema_dbo,
           HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE FULLTEXT CATALOG') AS create_fulltext_catalog
  `.execute(db);
  const r = rechten[0] ?? {};

  console.log("SQL Server");
  regel("versie", `${c.hoofdversie ?? "?"} (${VERSIES[c.hoofdversie ?? 0] ?? "onbekend"})`);
  regel("editie", `${c.editie ?? "?"} (${EDITIES[c.editie ?? 0] ?? "onbekend"})`);
  regel("database", i?.database ?? "?");
  regel("collatie", c.collatie ?? "?");
  regel(
    "standaardschema",
    `${i?.standaardschema ?? "?"}${i?.standaardschema && i.standaardschema !== "dbo" ? "  (verwacht dbo)" : ""}`
  );
  regel("NOCOUNT (user options)", c.nocount === 1 ? "AAN (probleem)" : "uit");
  regel("READ_COMMITTED_SNAPSHOT", janee(c.rcsi));
  regel("servertijd − UTC", `${i?.minuten_lokaal_min_utc ?? "?"} min (de app rekent altijd in UTC)`);
  regel(
    "Full-Text Search",
    `${janee(c.fts)}${c.fts === 1 ? `, Nederlands (1043): ${i?.nederlands ? "ja" : "nee"}` : ""}`
  );
  regel(
    "full-text-index",
    `${c.ftindex === null ? "geen tabel dbo.articles" : janee(c.ftindex)}${c.ftwachtend ? ` (${c.ftwachtend} wijzigingen wachten)` : ""}`
  );

  console.log("\nRechten van de login");
  for (const [k, v] of Object.entries(r)) regel(k, janee(v));
  if (r.db_owner === 1) console.log("  (db_owner heeft alle rechten in deze database, ook die van de andere rollen)");
  if (r.create_table !== 1 || r.alter_schema_dbo !== 1) {
    console.log("  → zonder CREATE TABLE en ALTER op dbo kan de app niet zelf migreren (DB_AUTO_MIGRATE / db:migrate)");
  }

  console.log("\nVerbinding");
  try {
    const { rows: verbinding } = await sql<Record<string, unknown>>`
      SELECT encrypt_option, auth_scheme, net_transport, protocol_type
      FROM sys.dm_exec_connections WHERE session_id = @@SPID
    `.execute(db);
    for (const [k, v] of Object.entries(verbinding[0] ?? {})) regel(k, String(v));
  } catch {
    // sys.dm_exec_connections vraagt VIEW SERVER STATE; CONNECTIONPROPERTY niet.
    const { rows: verbinding } = await sql<Record<string, unknown>>`
      SELECT CAST(CONNECTIONPROPERTY('auth_scheme') AS nvarchar(40)) AS auth_scheme,
             CAST(CONNECTIONPROPERTY('net_transport') AS nvarchar(40)) AS net_transport,
             CAST(CONNECTIONPROPERTY('protocol_type') AS nvarchar(40)) AS protocol_type
    `.execute(db);
    for (const [k, v] of Object.entries(verbinding[0] ?? {})) regel(k, String(v));
    regel("encrypt_option", "onbekend (vraagt VIEW SERVER STATE)");
  }

  if (i?.migraties) {
    const { rows: migraties } = await sql<{ naam: string }>`SELECT "naam" FROM dbo.kb_migrations ORDER BY "naam"`.execute(db);
    console.log(`\nUitgevoerde migraties: ${migraties.map((m) => m.naam).join(", ") || "(geen)"}`);
  } else {
    console.log("\nUitgevoerde migraties: nog geen (tabel kb_migrations ontbreekt)");
  }

  console.log("\nOordeel voor de app");
  regel("zoeken", oordeel.zoeken);
  for (const f of oordeel.fataal) console.log(`  FATAAL: ${f}`);
  for (const w of oordeel.waarschuwingen) console.log(`  waarschuwing: ${w}`);
  if (!oordeel.fataal.length && !oordeel.waarschuwingen.length) console.log("  alles in orde");
  fataal = oordeel.fataal.length > 0;
} catch (err) {
  // Geen serveradres of gebruiker tonen: code en nummer, en alleen bij een
  // fout van een query (EREQUEST) de servermelding.
  const e = (Array.isArray(err) ? err[0] : err) as { code?: unknown; number?: unknown; message?: unknown };
  const melding = e?.code === "EREQUEST" && typeof e.message === "string" ? `: ${e.message}` : "";
  console.error(
    `Controle mislukt: ${String(e?.code ?? "onbekende fout")}${typeof e?.number === "number" ? ` nr ${e.number}` : ""}${melding}`
  );
  fataal = true;
} finally {
  await db.destroy();
}
process.exitCode = fataal ? 1 : 0;
