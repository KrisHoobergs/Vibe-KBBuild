/**
 * Back-up van de productie-database, ALLEEN LEZEN.
 *
 * Gebruik:  npm run db:backup
 * Leest:    PROD_DATABASE_URL uit .env.local (Supabase "Session pooler"-URI)
 * Schrijft: ../KBBuild-backups/<tijdstempel>/ (buiten de repo; bevat gevoelige
 *           data zoals wachtwoord-hashes, dus nooit committen of delen)
 *
 * Alles loopt in één transactie met READ ONLY: de database zelf weigert elke
 * schrijfpoging. Er wordt niets aangemaakt, gewijzigd of verwijderd.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "..");

if (existsSync(path.join(ROOT, ".env.local"))) {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
}

const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error("PROD_DATABASE_URL ontbreekt in .env.local");
  process.exit(1);
}

// Tijdstempels en grote getallen letterlijk overnemen zoals Postgres ze geeft,
// zodat er bij het exporteren geen precisie verloren gaat.
const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    const raw = new Set([20, 1082, 1114, 1184, 1700]); // int8, date, timestamp, timestamptz, numeric
    if (raw.has(oid)) return (v: string) => v;
    return pg.types.getTypeParser(oid, format);
  },
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const doel = path.resolve(process.env.BACKUP_DIR ?? path.join(ROOT, "..", "KBBuild-backups"), stamp);

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  types,
  application_name: "kbbuild-backup-export",
});

function schrijf(naam: string, data: unknown) {
  writeFileSync(path.join(doel, naam), JSON.stringify(data, null, 2), "utf8");
}

async function kolommenZonderGegenereerde(schema: string, tabel: string): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER'
     ORDER BY ordinal_position`,
    [schema, tabel]
  );
  return rows.map((r) => r.column_name);
}

async function exporteerTabel(schema: string, tabel: string): Promise<number> {
  const kolommen = await kolommenZonderGegenereerde(schema, tabel);
  if (kolommen.length === 0) return 0;
  const lijst = kolommen.map((k) => `"${k.replace(/"/g, '""')}"`).join(", ");
  const { rows } = await client.query(`SELECT ${lijst} FROM "${schema}"."${tabel}"`);
  schrijf(`${schema}.${tabel}.json`, rows);
  return rows.length;
}

async function main() {
  mkdirSync(doel, { recursive: true });
  await client.connect();

  // Eén consistente momentopname, en de server weigert elke schrijfactie.
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

  const tellingen: Record<string, number> = {};

  const { rows: publicTabellen } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  for (const { table_name } of publicTabellen) {
    tellingen[`public.${table_name}`] = await exporteerTabel("public", table_name);
  }

  // Accounts (incl. wachtwoord-hashes) en de metadata van de opslag. De
  // bestanden zelf blijven in Supabase Storage en worden niet aangeraakt.
  for (const [schema, tabel] of [
    ["auth", "users"],
    ["auth", "identities"],
    ["storage", "buckets"],
    ["storage", "objects"],
  ] as const) {
    tellingen[`${schema}.${tabel}`] = await exporteerTabel(schema, tabel);
  }

  // Schema-informatie, om de structuur te kunnen nakijken of herbouwen.
  const schemaInfo = {
    kolommen: (
      await client.query(
        `SELECT table_name, column_name, data_type, is_nullable, column_default, is_generated, generation_expression
         FROM information_schema.columns WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`
      )
    ).rows,
    constraints: (
      await client.query(
        `SELECT conrelid::regclass::text AS tabel, conname AS naam, pg_get_constraintdef(oid) AS definitie
         FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`
      )
    ).rows,
    indexen: (
      await client.query(
        `SELECT tablename AS tabel, indexname AS naam, indexdef AS definitie
         FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2`
      )
    ).rows,
    functies: (
      await client.query(
        `SELECT p.proname AS naam, pg_get_function_identity_arguments(p.oid) AS argumenten,
                pg_get_functiondef(p.oid) AS definitie
         FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
         ORDER BY 1, 2`
      )
    ).rows,
    triggers: (
      await client.query(
        `SELECT t.tgrelid::regclass::text AS tabel, t.tgname AS naam, pg_get_triggerdef(t.oid) AS definitie
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         WHERE NOT t.tgisinternal AND c.relnamespace IN ('public'::regnamespace, 'auth'::regnamespace)
         ORDER BY 1, 2`
      )
    ).rows,
    policies: (
      await client.query(
        `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
         FROM pg_policies WHERE schemaname IN ('public', 'storage') ORDER BY 1, 2, 3`
      )
    ).rows,
  };
  schrijf("_schema.json", schemaInfo);

  const versie = (await client.query<{ server_version: string }>("SHOW server_version")).rows[0].server_version;

  await client.query("COMMIT");

  schrijf("_manifest.json", {
    gemaakt_op: new Date().toISOString(),
    server_version: versie,
    rijen: tellingen,
  });

  console.log(`Back-up klaar in ${doel}`);
  console.table(tellingen);
}

main()
  .catch((err) => {
    console.error("Back-up mislukt:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
