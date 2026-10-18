/**
 * Lokale PostgreSQL voor ontwikkelen en testen, zonder installatie
 * (embedded-postgres). De data staat in .lokale-db/ (genegeerd door git).
 *
 *   npm run db:lokaal                      start de database (blijft draaien tot Ctrl+C)
 *   npm run db:lokaal -- import <map>      laadt een back-up (zie db:backup) in de lokale database
 *   npm run db:lokaal -- import laatste    idem, met de nieuwste back-up
 *
 * Alleen localhost is toegestaan; dit script raakt nooit een Supabase-database.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { migreer } from "../src/lib/db/migrate";
import { postgresBasisMigraties } from "../src/lib/db/migrations/postgres";
import { assertLokaleDatabase } from "../src/lib/db/guard";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, ".lokale-db");
const POORT = 54329;
const WACHTWOORD = "lokaal";
const DATABASE = "kbbuild";
export const LOKALE_URL = `postgres://postgres:${WACHTWOORD}@localhost:${POORT}/${DATABASE}`;

// Volgorde respecteert de foreign keys.
const TABELLEN = ["profiles", "tags", "articles", "article_tags", "invitations", "mail_settings"];

function maakDb() {
  assertLokaleDatabase(LOKALE_URL);
  return new Kysely<Record<string, Record<string, unknown>>>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: LOKALE_URL, max: 2 }) }),
  });
}

async function start() {
  const server = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: POORT,
    user: "postgres",
    password: WACHTWOORD,
    persistent: true,
    // Zelfde locale als productie: ICU en-US voor de sortering, en een echte
    // (geen "C") LC_CTYPE. Die bepaalt hoe full-text search woorden splitst:
    // met "C" telt bv. een typografisch aanhalingsteken als letter en wordt
    // `test”` één woord.
    initdbFlags: [
      "--encoding=UTF8",
      "--locale-provider=icu",
      "--icu-locale=en-US",
      `--locale=${process.platform === "win32" ? "en-US" : "en_US.UTF-8"}`,
    ],
    onLog: () => {},
  });

  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log("Lokale database wordt aangemaakt …");
    await server.initialise();
  }
  await server.start();

  const beheer = new pg.Client({
    connectionString: `postgres://postgres:${WACHTWOORD}@localhost:${POORT}/postgres`,
  });
  await beheer.connect();
  const bestaat = await beheer.query("SELECT 1 FROM pg_database WHERE datname = $1", [DATABASE]);
  if (bestaat.rowCount === 0) await server.createDatabase(DATABASE);
  await beheer.end();

  const db = maakDb();
  const nieuw = await migreer(db, "postgres", postgresBasisMigraties);
  await db.destroy();
  if (nieuw.length) console.log(`Uitgevoerd: ${nieuw.join(", ")}`);

  console.log(`\nLokale PostgreSQL draait op poort ${POORT}.`);
  console.log(`DATABASE_URL=${LOKALE_URL}`);
  console.log("Stoppen met Ctrl+C.\n");

  const stop = async () => {
    console.log("\nLokale database stopt …");
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

function zoekBackup(arg: string | undefined): string {
  const basis = path.resolve(process.env.BACKUP_DIR ?? path.join(ROOT, "..", "KBBuild-backups"));
  if (!arg || arg === "laatste") {
    if (!existsSync(basis)) throw new Error(`Geen back-ups gevonden in ${basis}`);
    const mappen = readdirSync(basis).filter((m) => existsSync(path.join(basis, m, "_manifest.json"))).sort();
    if (mappen.length === 0) throw new Error(`Geen back-ups gevonden in ${basis}`);
    return path.join(basis, mappen[mappen.length - 1]);
  }
  return path.resolve(arg);
}

async function importeer(arg: string | undefined) {
  const map = zoekBackup(arg);
  console.log(`Back-up laden uit ${map}`);
  const db = maakDb();

  try {
    await db.transaction().execute(async (trx) => {
      // De lokale kopie wordt telkens volledig vervangen (alleen lokaal!).
      for (const tabel of [...TABELLEN].reverse()) {
        await sql`DELETE FROM ${sql.table(tabel)}`.execute(trx);
      }

      for (const tabel of TABELLEN) {
        const bestand = path.join(map, `public.${tabel}.json`);
        if (!existsSync(bestand)) {
          console.log(`  ${tabel}: geen bestand, overgeslagen`);
          continue;
        }
        const rijen = JSON.parse(readFileSync(bestand, "utf8")) as Record<string, unknown>[];
        const kolommen = new Set(
          (
            await sql<{ column_name: string }>`
              SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = ${tabel} AND is_generated = 'NEVER'
            `.execute(trx)
          ).rows.map((r) => r.column_name)
        );

        for (const rij of rijen) {
          const waarden = Object.fromEntries(
            Object.entries(rij)
              .filter(([k]) => kolommen.has(k))
              .map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])
          );
          await trx.insertInto(tabel).values(waarden).execute();
        }
        console.log(`  ${tabel}: ${rijen.length} rijen`);
      }
    });
    console.log("Klaar.");
  } finally {
    await db.destroy();
  }
}

const [opdracht, arg] = process.argv.slice(2);
(opdracht === "import" ? importeer(arg) : start()).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
