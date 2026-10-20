/**
 * Test van de SQL Server-migraties en de migratierunner tegen een SQL Server-
 * TESTdatabase (MSSQL_TEST_* in .env.local of de omgeving).
 *
 *   npm run db:test:migraties:mssql
 *
 * LET OP: maakt de testdatabase leeg (alle tabellen). Weigert elke database
 * die niet kb_test…/kennisbank_test… heet of de markering kb_testdatabase
 * mist (scripts/lib/mssql-testomgeving.mts, scripts/mssql/testdatabase.sql).
 * Na afloop zijn alle migraties uitgevoerd op een lege database.
 *
 * Optioneel MSSQL_TEST_FULLTEXT_VERWACHT=1 of 0: controleert dat de server
 * wel of geen Full-Text Search heeft (CI-varianten).
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { sql, type Kysely } from "kysely";
import type { Migratie } from "../src/lib/db/migrate";
import {
  assertMssqlTestdatabase,
  maakMssqlTestdatabaseLeeg,
  zetMssqlTestomgeving,
} from "./lib/mssql-testomgeving.mjs";

zetMssqlTestomgeving();
const fulltextVerwacht = process.env.MSSQL_TEST_FULLTEXT_VERWACHT;

const { leesConfig } = await import("../src/lib/config");
const { maakKysely } = await import("../src/lib/db/connection");
const { migreer } = await import("../src/lib/db/migrate");
const { mssqlMigraties } = await import("../src/lib/db/migrations/mssql");
const { fulltext } = await import("../src/lib/db/migrations/mssql/0005_fulltext");
const { voerMigratiesUit } = await import("../src/lib/db/auto-migrate");
const { foutNummers } = await import("../src/lib/db/dialect");
const { betterAuthOpties } = await import("../src/lib/auth/better-auth-opties");
const { getMigrations } = await import("better-auth/db/migration");
const { betterAuth } = await import("better-auth");

const config = leesConfig();
if (config.db.dialect !== "mssql") throw new Error("De testomgeving zette DB_DIALECT=mssql niet");
const mssqlConfig = config.db;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>;
const instanties: Db[] = [];
/** Een eigen Kysely-instantie (eigen pool, dus eigen sessies), zoals een tweede proces. */
function nieuweDb(poolMax = 1): Db {
  const { db } = maakKysely({ ...mssqlConfig, poolMax }, { requestTimeoutMs: 120_000 });
  instanties.push(db);
  return db;
}
const db = nieuweDb(2);
const stil = () => {};
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

let geslaagd = 0;
async function stap(naam: string, fn: () => Promise<void>) {
  const start = performance.now();
  try {
    await fn();
    geslaagd++;
    console.log(`✓ ${naam} (${Math.round(performance.now() - start)} ms)`);
  } catch (err) {
    console.error(`✗ ${naam}`);
    throw err;
  }
}

async function tabellen(d: Db = db): Promise<string[]> {
  const { rows } = await sql<{ naam: string }>`
    SELECT name AS naam FROM sys.tables WHERE is_ms_shipped = 0 ORDER BY name
  `.execute(d);
  return rows.map((r) => r.naam);
}

async function vastgelegd(d: Db = db): Promise<string[]> {
  if (!(await tabellen(d)).includes("kb_migrations")) return [];
  const { rows } = await sql<{ naam: string }>`SELECT "naam" FROM dbo.kb_migrations ORDER BY "naam"`.execute(d);
  return rows.map((r) => r.naam);
}

async function bestaat(tabel: string, d: Db = db): Promise<boolean> {
  return (await tabellen(d)).includes(tabel);
}

/**
 * Alle objecten, kolommen en indexen: om te zien dat een tweede up() niets
 * verandert. Samengevoegd in JS: de catalogusviews hebben verschillende
 * collaties (Msg 451 bij CONCAT).
 */
async function schemaAfdruk(): Promise<string> {
  const { rows: objecten } = await sql<Record<string, unknown>>`
    SELECT OBJECT_NAME(parent_object_id) AS ouder, name, type_desc
    FROM sys.objects WHERE is_ms_shipped = 0
  `.execute(db);
  const { rows: kolommen } = await sql<Record<string, unknown>>`
    SELECT t.name AS tabel, c.name, ty.name AS type, c.max_length, c.scale, c.is_nullable
    FROM sys.columns c
    JOIN sys.tables t ON t.object_id = c.object_id
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE t.is_ms_shipped = 0
  `.execute(db);
  const { rows: indexen } = await sql<Record<string, unknown>>`
    SELECT t.name AS tabel, i.name, i.type_desc, i.is_unique
    FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id
    WHERE t.is_ms_shipped = 0 AND i.name IS NOT NULL
  `.execute(db);
  return [...objecten, ...kolommen, ...indexen]
    .map((r) => Object.values(r).map(String).join(" "))
    .sort()
    .join("\n");
}

const APP_TABELLEN = [
  "article_tags",
  "articles",
  "auth_accounts",
  "auth_sessions",
  "auth_users",
  "auth_verifications",
  "files",
  "invitations",
  "kb_migrations",
  "mail_settings",
  "password_resets",
  "profiles",
  "tags",
];

// Verwacht: zoals Postgres, behalve reviewer_id en created_by (NO ACTION, Msg 1785).
const VERWACHTE_FOREIGN_KEYS = [
  "FK_article_tags_article article_tags.article_id -> articles CASCADE",
  "FK_article_tags_tag article_tags.tag_id -> tags CASCADE",
  "FK_articles_author articles.author_id -> profiles CASCADE",
  "FK_articles_reviewer articles.reviewer_id -> profiles NO_ACTION",
  "FK_auth_accounts_user auth_accounts.userId -> auth_users CASCADE",
  "FK_auth_sessions_user auth_sessions.userId -> auth_users CASCADE",
  "FK_invitations_invited_by invitations.invited_by -> profiles NO_ACTION",
  "FK_mail_settings_user mail_settings.user_id -> profiles CASCADE",
  "FK_password_resets_created_by password_resets.created_by -> profiles NO_ACTION",
  "FK_password_resets_user password_resets.user_id -> profiles CASCADE",
  "FK_profiles_auth_users profiles.id -> auth_users CASCADE",
];

let fulltextBeschikbaar = false;
let alles: string[] = [];

try {
  await stap("testdatabase gecontroleerd (naam en markering kb_testdatabase)", async () => {
    await assertMssqlTestdatabase(db);
  });

  await stap("testdatabase leegmaken (scripts/mssql/leegmaken.sql)", async () => {
    await maakMssqlTestdatabaseLeeg(db);
    assert.deepEqual(await tabellen(), []);
  });

  await stap("Full-Text Search op deze server bepaald", async () => {
    const { rows } = await sql<{ fts: number | null; nederlands: number }>`
      SELECT CAST(FULLTEXTSERVICEPROPERTY('IsFullTextInstalled') AS int) AS fts,
             (SELECT COUNT(*) FROM sys.fulltext_languages WHERE lcid = 1043) AS nederlands
    `.execute(db);
    fulltextBeschikbaar = rows[0]?.fts === 1 && (rows[0]?.nederlands ?? 0) > 0;
    console.log(`    full-text met Nederlands: ${fulltextBeschikbaar ? "ja" : "nee"}`);
    if (fulltextVerwacht !== undefined) assert.equal(fulltextBeschikbaar, fulltextVerwacht === "1");
    alles = mssqlMigraties.map((m) => m.naam).filter((n) => fulltextBeschikbaar || n !== "0005_fulltext");
  });

  await stap("alle migraties via voerMigratiesUit (db:migrate en DB_AUTO_MIGRATE)", async () => {
    const log: string[] = [];
    const uitgevoerd = await voerMigratiesUit((b) => log.push(b));
    assert.deepEqual(uitgevoerd, alles);
    assert.deepEqual(await vastgelegd(), [...alles].sort());
    const overgeslagen = log.filter((l) => /0005_fulltext overgeslagen/.test(l));
    assert.equal(overgeslagen.length, fulltextBeschikbaar ? 0 : 1, log.join("\n"));
    if (!fulltextBeschikbaar) console.log(`    ${overgeslagen[0]}`);
  });

  await stap("tweede keer: niets uitgevoerd, 0005 niet vastgelegd zonder full-text", async () => {
    const log: string[] = [];
    assert.deepEqual(await voerMigratiesUit((b) => log.push(b)), []);
    assert.deepEqual(await vastgelegd(), [...alles].sort());
    assert.equal(log.some((l) => /0005_fulltext overgeslagen/.test(l)), !fulltextBeschikbaar);
  });

  await stap("schema: tabellen, kolomtypes en berekende kolom search_text", async () => {
    assert.deepEqual(await tabellen(), APP_TABELLEN);
    const { rows: kolommen } = await sql<{
      tabel: string;
      kolom: string;
      type: string;
      lengte: number;
      schaal: number;
      berekend: boolean;
    }>`
      SELECT t.name AS tabel, c.name AS kolom, ty.name AS type, c.max_length AS lengte,
             c.scale AS schaal, c.is_computed AS berekend
      FROM sys.columns c
      JOIN sys.tables t ON t.object_id = c.object_id
      JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      WHERE t.is_ms_shipped = 0
    `.execute(db);
    // Geen varchar/char/text (impliciete conversie), geen oud datetime, geen uniqueidentifier.
    const verboden = kolommen.filter((k) =>
      ["varchar", "char", "text", "ntext", "datetime", "smalldatetime", "uniqueidentifier", "timestamp"].includes(k.type)
    );
    assert.deepEqual(verboden, []);
    // Elk id en elke verwijzing: nvarchar(36) (72 bytes).
    const sleutels = kolommen.filter(
      (k) =>
        k.tabel !== "kb_migrations" &&
        (k.kolom === "id" || k.kolom.endsWith("_id") || k.kolom === "userId" || ["invited_by", "created_by"].includes(k.kolom))
    );
    assert.ok(sleutels.length >= 15, `te weinig sleutelkolommen gevonden (${sleutels.length})`);
    for (const k of sleutels) assert.ok(k.type === "nvarchar" && k.lengte === 72, `${k.tabel}.${k.kolom} is ${k.type}(${k.lengte})`);
    // Tijdstippen: datetime2(3).
    for (const k of kolommen.filter((k) => k.type === "datetime2")) assert.equal(k.schaal, 3, `${k.tabel}.${k.kolom}`);
    assert.deepEqual(
      kolommen.filter((k) => k.berekend).map((k) => `${k.tabel}.${k.kolom}`),
      ["articles.search_text"]
    );
    const { rows } = await sql<{ persisted: boolean; deterministisch: number; precies: number }>`
      SELECT cc.is_persisted AS persisted,
             COLUMNPROPERTY(OBJECT_ID(N'dbo.articles'), 'search_text', 'IsDeterministic') AS deterministisch,
             COLUMNPROPERTY(OBJECT_ID(N'dbo.articles'), 'search_text', 'IsPrecise') AS precies
      FROM sys.computed_columns cc
      WHERE cc.object_id = OBJECT_ID(N'dbo.articles') AND cc.name = N'search_text'
    `.execute(db);
    assert.deepEqual(rows[0], { persisted: true, deterministisch: 1, precies: 1 });
  });

  await stap("constraints hebben een naam (PK_, UQ_, FK_, DF_, CK_)", async () => {
    const { rows } = await sql<{ naam: string; tabel: string }>`
      SELECT name AS naam, OBJECT_NAME(parent_object_id) AS tabel FROM sys.key_constraints WHERE is_system_named = 1
      UNION ALL SELECT name, OBJECT_NAME(parent_object_id) FROM sys.foreign_keys WHERE is_system_named = 1
      UNION ALL SELECT name, OBJECT_NAME(parent_object_id) FROM sys.default_constraints WHERE is_system_named = 1
      UNION ALL SELECT name, OBJECT_NAME(parent_object_id) FROM sys.check_constraints WHERE is_system_named = 1
    `.execute(db);
    assert.deepEqual(rows, []);
  });

  await stap("foreign keys: verwijderacties zoals verwacht (reviewer_id en created_by NO ACTION)", async () => {
    // Samenvoegen in JS: de catalogusviews hebben verschillende collaties (Msg 451).
    const { rows } = await sql<{ naam: string; tabel: string; kolom: string; doel: string; actie: string }>`
      SELECT fk.name AS naam, OBJECT_NAME(fk.parent_object_id) AS tabel, c.name AS kolom,
             OBJECT_NAME(fk.referenced_object_id) AS doel, fk.delete_referential_action_desc AS actie
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    `.execute(db);
    assert.deepEqual(
      rows.map((r) => `${r.naam} ${r.tabel}.${r.kolom} -> ${r.doel} ${r.actie}`).sort(),
      VERWACHTE_FOREIGN_KEYS
    );
    const { rows: bijwerken } = await sql<{ aantal: number }>`
      SELECT COUNT(*) AS aantal FROM sys.foreign_keys WHERE update_referential_action <> 0
    `.execute(db);
    assert.equal(bijwerken[0]?.aantal, 0);
  });

  await stap("geen triggers (Better Auth schrijft met OUTPUT inserted.*)", async () => {
    const { rows } = await sql<{ aantal: number }>`SELECT COUNT(*) AS aantal FROM sys.triggers`.execute(db);
    assert.equal(rows[0]?.aantal, 0);
  });

  await stap("SET NULL op reviewer_id zou Msg 1785 geven (tegenproef)", async () => {
    let fout: unknown;
    try {
      await sql`
        CREATE TABLE dbo.zz_cascadepaden (
          "id" nvarchar(36) NOT NULL CONSTRAINT PK_zz_cascadepaden PRIMARY KEY,
          "author_id" nvarchar(36) NOT NULL
            CONSTRAINT FK_zz_cascadepaden_author REFERENCES dbo.profiles ("id") ON DELETE CASCADE,
          "reviewer_id" nvarchar(36) NULL
            CONSTRAINT FK_zz_cascadepaden_reviewer REFERENCES dbo.profiles ("id") ON DELETE SET NULL
        )
      `.execute(db);
    } catch (err) {
      fout = err;
    }
    assert.ok(fout, "CREATE TABLE had moeten mislukken");
    assert.ok(foutNummers(fout).includes(1785), `foutnummers: ${foutNummers(fout).join(", ")}`);
    console.log(`    foutnummers ${foutNummers(fout).join(" + ")}${Array.isArray(fout) ? " (als array)" : ""}`);
    assert.equal(await bestaat("zz_cascadepaden"), false);
  });

  await stap("Better Auth: getMigrations meldt niets te maken of toe te voegen", async () => {
    const meldingen: string[] = [];
    const opties = {
      ...betterAuthOpties(db, {
        secret: process.env.BETTER_AUTH_SECRET!,
        baseURL: process.env.SITE_URL!,
        dialect: "mssql",
      }),
      logger: {
        level: "warn" as const,
        log: (niveau: string, bericht: string) => {
          if (niveau === "warn" || niveau === "error") meldingen.push(`${niveau}: ${bericht}`);
        },
      },
    };
    const m = await getMigrations(opties);
    assert.deepEqual(m.toBeCreated, []);
    assert.deepEqual(m.toBeAdded, []);
    assert.deepEqual(m.toBeAddedIndexes, []);
    assert.deepEqual(m.schemaProblems, []);
    assert.deepEqual(meldingen, [], "Better Auth gaf waarschuwingen (bv. een ander kolomtype)");
    // De schemacontrole bij het eerste gebruik: geen SchemaMismatchError.
    const instantie = betterAuth(opties);
    assert.equal(await instantie.api.getSession({ headers: new Headers() }), null);
    assert.equal(
      await instantie.api.getSession({ headers: new Headers({ cookie: "better-auth.session_token=bestaat.niet" }) }),
      null
    );
    assert.deepEqual(meldingen, []);
  });

  await stap("elke migratie nog eens uitvoeren (up) verandert niets", async () => {
    const voor = await schemaAfdruk();
    for (const migratie of mssqlMigraties) {
      if (migratie.transactioneel) {
        await db.transaction().execute(async (trx) => {
          await migratie.up(trx);
        });
      } else {
        await migratie.up(db);
      }
    }
    assert.equal(await schemaAfdruk(), voor);
  });

  await stap("0005_fulltext twee keer los uitvoeren: geen fout", async () => {
    const eerste = await fulltext.up(db);
    const tweede = await fulltext.up(db);
    if (!fulltextBeschikbaar) {
      assert.equal(eerste, "overgeslagen");
      assert.equal(tweede, "overgeslagen");
      assert.equal((await vastgelegd()).includes("0005_fulltext"), false);
      return;
    }
    assert.equal(eerste, undefined);
    assert.equal(tweede, undefined);
    // FT-5: eigenschappen van catalogus en index.
    const { rows } = await sql<{
      tracking: string;
      stoplijst: number | null;
      accent: number;
      kolommen: number;
      sleutel: string;
    }>`
      SELECT fi.change_tracking_state_desc AS tracking, fi.stoplist_id AS stoplijst,
             CAST(FULLTEXTCATALOGPROPERTY(N'kb_fulltext', 'AccentSensitivity') AS int) AS accent,
             (SELECT COUNT(*) FROM sys.fulltext_index_columns fic
               WHERE fic.object_id = fi.object_id AND fic.language_id = 1043) AS kolommen,
             (SELECT name FROM sys.indexes WHERE object_id = fi.object_id AND index_id = fi.unique_index_id) AS sleutel
      FROM sys.fulltext_indexes fi WHERE fi.object_id = OBJECT_ID(N'dbo.articles')
    `.execute(db);
    assert.deepEqual(rows[0], { tracking: "AUTO", stoplijst: null, accent: 0, kolommen: 3, sleutel: "PK_articles" });
  });

  await stap("twee processen tegelijk: elke migratie precies één keer", async () => {
    await maakMssqlTestdatabaseLeeg(db);
    const a = nieuweDb();
    const b = nieuweDb();
    const [ra, rb] = await Promise.all([
      migreer(a, "mssql", mssqlMigraties, stil),
      migreer(b, "mssql", mssqlMigraties, stil),
    ]);
    assert.deepEqual([...ra, ...rb].sort(), [...alles].sort(), `a: ${ra.join(",")} | b: ${rb.join(",")}`);
    assert.deepEqual(ra.filter((n) => rb.includes(n)), []);
    assert.deepEqual(await vastgelegd(), [...alles].sort());
    console.log(`    proces a: ${ra.length} migraties, proces b: ${rb.length}`);
  });

  await stap("trage migratie (20 s): het tweede proces wacht op de lock en slaagt", async () => {
    const traag: Migratie = {
      naam: "zz_9001_traag",
      transactioneel: true,
      async up(d) {
        await sql`WAITFOR DELAY '00:00:20'`.execute(d);
        await sql`CREATE TABLE dbo.zz_traag ("id" int NOT NULL)`.execute(d);
      },
    };
    const a = nieuweDb();
    const b = nieuweDb();
    const pa = migreer(a, "mssql", [traag], stil);
    await wacht(1_000);
    const startB = performance.now();
    const rb = await migreer(b, "mssql", [traag], stil);
    const duurB = performance.now() - startB;
    const ra = await pa;
    assert.deepEqual(ra, ["zz_9001_traag"]);
    assert.deepEqual(rb, []);
    assert.ok(duurB > 15_000, `proces b wachtte maar ${Math.round(duurB)} ms`);
    console.log(`    proces b wachtte ${(duurB / 1000).toFixed(1)} s op de lock`);
    assert.equal(await bestaat("zz_traag"), true);
    await sql`DROP TABLE dbo.zz_traag`.execute(db);
    await sql`DELETE FROM dbo.kb_migrations WHERE "naam" = N'zz_9001_traag'`.execute(db);
  });

  await stap("mislukte migratie: niets blijft achter, echte fout, lock vrij", async () => {
    let sessie: number | undefined;
    const goed: Migratie = {
      naam: "zz_9002_goed",
      transactioneel: true,
      async up(d) {
        await sql`CREATE TABLE dbo.zz_goed ("id" int NOT NULL)`.execute(d);
      },
    };
    const kapot: Migratie = {
      naam: "zz_9003_kapot",
      transactioneel: true,
      async up(d) {
        const { rows } = await sql<{ spid: number }>`SELECT @@SPID AS spid`.execute(d);
        sessie = rows[0]?.spid;
        await sql`CREATE TABLE dbo.zz_kapot ("id" int NOT NULL)`.execute(d);
        await sql`THROW 50000, N'opzettelijke fout in een testmigratie', 1`.execute(d);
      },
    };
    const a = nieuweDb();
    await assert.rejects(migreer(a, "mssql", [goed, kapot], stil), (err: unknown) => {
      assert.deepEqual(foutNummers(err), [50000]);
      return true;
    });
    assert.equal(await bestaat("zz_goed"), true);
    assert.equal(await bestaat("zz_kapot"), false);
    const rijen = await vastgelegd();
    assert.ok(rijen.includes("zz_9002_goed") && !rijen.includes("zz_9003_kapot"), rijen.join(","));

    // Dezelfde sessie (pool van 1) houdt de lock niet meer vast …
    const { rows } = await sql<{ spid: number; modus: string }>`
      SELECT @@SPID AS spid, APPLOCK_MODE('public', N'kb_migrations', 'Session') AS modus
    `.execute(a);
    assert.equal(rows[0]?.spid, sessie, "niet dezelfde sessie als de migratie");
    assert.equal(rows[0]?.modus, "NoLock");
    // … en een ander proces kan hem meteen krijgen.
    const { rows: test } = await sql<{ vrij: number }>`
      SELECT APPLOCK_TEST('public', N'kb_migrations', 'Exclusive', 'Session') AS vrij
    `.execute(nieuweDb());
    assert.equal(test[0]?.vrij, 1);
  });

  await stap("server rolt zelf terug (XACT_ABORT): de echte fout 8134, niet 3903", async () => {
    const kapot: Migratie = {
      naam: "zz_9004_xact_abort",
      transactioneel: true,
      async up(d) {
        await sql`SET XACT_ABORT ON; CREATE TABLE dbo.zz_xact ("id" int NOT NULL); SELECT 1 / 0 AS nul`.execute(d);
      },
    };
    const a = nieuweDb();
    await assert.rejects(migreer(a, "mssql", [kapot], stil), (err: unknown) => {
      assert.ok(foutNummers(err).includes(8134), `foutnummers: ${foutNummers(err).join(", ")}`);
      assert.ok(!foutNummers(err).includes(3903));
      return true;
    });
    assert.equal(await bestaat("zz_xact"), false);
    assert.equal((await vastgelegd()).includes("zz_9004_xact_abort"), false);
    const { rows } = await sql<{ vrij: number }>`
      SELECT APPLOCK_TEST('public', N'kb_migrations', 'Exclusive', 'Session') AS vrij
    `.execute(nieuweDb());
    assert.equal(rows[0]?.vrij, 1);
  });

  await stap("eindtoestand: lege database, alle migraties uitgevoerd", async () => {
    await maakMssqlTestdatabaseLeeg(db);
    assert.deepEqual(await voerMigratiesUit(stil), alles);
    assert.deepEqual(await tabellen(), APP_TABELLEN);
  });

  console.log(`\nAlle ${geslaagd} stappen geslaagd.`);
} catch (err) {
  // Geen serveradres of gebruiker tonen: een verbindingsfout van tedious
  // (ESOCKET, ELOGIN, ETIMEOUT, …) alleen met haar code. Serverfouten
  // (EREQUEST, met nummer) en mislukte controles wel volledig.
  const fouten = Array.isArray(err) ? err : [err];
  for (const f of fouten) {
    const e = f as { code?: unknown; number?: unknown; message?: unknown; stack?: unknown };
    if (typeof e?.code === "string" && /^E[A-Z]+$/.test(e.code) && e.code !== "EREQUEST") {
      console.error(`Verbindingsfout: ${e.code}`);
    } else {
      console.error(e?.stack ?? e?.message ?? f);
      if (typeof e?.number === "number") console.error(`  (SQL Server-fout nr ${e.number})`);
    }
  }
  process.exitCode = 1;
} finally {
  await Promise.all(instanties.map((d) => d.destroy()));
}
