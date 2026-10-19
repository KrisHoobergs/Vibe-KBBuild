import { sql, type Kysely } from "kysely";
import { losseFouten } from "./dialect";

// Kleine migratierunner voor installaties zonder Supabase (gewone PostgreSQL en
// SQL Server). Supabase-installaties gebruiken deze runner NOOIT: daar blijven
// migraties handwerk (supabase/migrations, alleen na akkoord).
//
// Migraties zijn TS-modules, zodat ze mee in de build zitten. Een migratie die
// niet in een transactie kan (bv. full-text-DDL op SQL Server) zet
// `transactioneel: false`.
//
// Een migratie kan "overgeslagen" teruggeven als de server iets mist dat ze
// nodig heeft (bv. Full-Text Search op SQL Server). Ze wordt dan NIET bewaard
// in kb_migrations, zodat ze de volgende keer opnieuw geprobeerd wordt.

export type Dialect = "postgres" | "mssql";

export type Migratie = {
  naam: string;
  transactioneel: boolean;
  /** Uitleg voor het log als up() "overgeslagen" teruggeeft. */
  overslaanReden?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  up(db: Kysely<any>): Promise<void | "overgeslagen">;
};

const TABEL = "kb_migrations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zorgVoorTabel(db: Kysely<any>, dialect: Dialect) {
  if (dialect === "postgres") {
    await sql`
      CREATE TABLE IF NOT EXISTS kb_migrations (
        naam VARCHAR(200) PRIMARY KEY,
        uitgevoerd_op TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
  } else {
    // nvarchar, zoals elke tekstsleutel op SQL Server (tedious stuurt strings als nvarchar).
    await sql`
      IF OBJECT_ID(N'dbo.kb_migrations', N'U') IS NULL
      CREATE TABLE dbo.kb_migrations (
        "naam" nvarchar(200) NOT NULL CONSTRAINT PK_kb_migrations PRIMARY KEY,
        "uitgevoerd_op" datetime2(3) NOT NULL CONSTRAINT DF_kb_migrations_op DEFAULT SYSUTCDATETIME()
      )
    `.execute(db);
  }
}

function meldOvergeslagen(migratie: Migratie, log: (bericht: string) => void) {
  log(`Migratie ${migratie.naam} overgeslagen${migratie.overslaanReden ? `: ${migratie.overslaanReden}` : ""}`);
}

/**
 * Tweede, URL-onafhankelijke beveiliging (naast src/lib/db/guard.ts): vraag de
 * database zelf of het een Supabase-database is. Zo ja: nooit migreren.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function weigerSupabaseDatabase(db: Kysely<any>, dialect: Dialect) {
  if (dialect !== "postgres") return;
  const { rows } = await sql<{ supabase: boolean }>`
    SELECT (
      to_regclass('auth.users') IS NOT NULL
      OR to_regclass('storage.buckets') IS NOT NULL
      OR to_regnamespace('supabase_migrations') IS NOT NULL
    ) AS supabase
  `.execute(db);
  if (rows[0]?.supabase) {
    throw new Error(
      "Geweigerd: dit is een Supabase-database. Migraties van deze runner draaien nooit op Supabase."
    );
  }
}

/**
 * Voert alle nog niet uitgevoerde migraties uit, in volgorde, met een lock,
 * zodat twee processen nooit tegelijk migreren. Geeft de namen terug van de
 * migraties die nu zijn uitgevoerd.
 */
export async function migreer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  dialect: Dialect,
  migraties: Migratie[],
  log: (bericht: string) => void = console.log
): Promise<string[]> {
  await weigerSupabaseDatabase(db, dialect);
  return dialect === "postgres"
    ? migreerPostgres(db, migraties, log)
    : migreerMssql(db, migraties, log);
}

/**
 * Postgres: alles in één transactie met een transactie-lock
 * (pg_advisory_xact_lock). Dat werkt ook achter een pooler in transactiemodus
 * (Neon, Supabase-pooler), waar een sessie-lock niet betrouwbaar is. DDL is
 * in Postgres transactioneel: mislukt één migratie, dan wordt niets bewaard.
 */
async function migreerPostgres(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  migraties: Migratie[],
  log: (bericht: string) => void
): Promise<string[]> {
  const uitgevoerd: string[] = [];
  await db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${TABEL}))`.execute(trx);
    await zorgVoorTabel(trx, "postgres");

    const rijen = await trx.selectFrom(TABEL).select("naam").execute();
    const gedaan = new Set(rijen.map((r: { naam: string }) => r.naam));

    for (const migratie of migraties) {
      if (gedaan.has(migratie.naam)) continue;
      log(`Migratie ${migratie.naam} …`);
      if ((await migratie.up(trx)) === "overgeslagen") {
        meldOvergeslagen(migratie, log);
        continue;
      }
      await trx.insertInto(TABEL).values({ naam: migratie.naam }).execute();
      uitgevoerd.push(migratie.naam);
    }
  });
  return uitgevoerd;
}

/**
 * SQL Server: per migratie, met een sessie-lock (sp_getapplock) op één vaste
 * verbinding. Een transactionele migratie en haar rij in kb_migrations gaan
 * samen in één transactie; een niet-transactionele migratie moet zelf
 * idempotent zijn (ze wordt pas na afloop bewaard).
 *
 * Een tweede proces wacht hooguit 60 s op de lock (@LockTimeout); de
 * verbinding moet dus een request-timeout van meer dan 60 s hebben
 * (auto-migrate.ts gebruikt 300 s).
 */
async function migreerMssql(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  migraties: Migratie[],
  log: (bericht: string) => void
): Promise<string[]> {
  const dialect: Dialect = "mssql";
  const uitgevoerd: string[] = [];

  await db.connection().execute(async (conn) => {
    await sql`
      DECLARE @r INT;
      EXEC @r = sp_getapplock @Resource = ${TABEL}, @LockMode = 'Exclusive',
        @LockOwner = 'Session', @LockTimeout = 60000;
      IF @r < 0 THROW 50000, 'Kon de migratielock niet krijgen', 1;
    `.execute(conn);

    try {
      await zorgVoorTabel(conn, dialect);

      const rijen = await conn.selectFrom(TABEL).select("naam").execute();
      const gedaan = new Set(rijen.map((r: { naam: string }) => r.naam));

      for (const migratie of migraties) {
        if (gedaan.has(migratie.naam)) continue;

        log(`Migratie ${migratie.naam} …`);
        let resultaat: void | "overgeslagen";
        if (migratie.transactioneel) {
          resultaat = await conn.transaction().execute(async (trx) => {
            const r = await migratie.up(trx);
            if (r !== "overgeslagen") await trx.insertInto(TABEL).values({ naam: migratie.naam }).execute();
            return r;
          });
        } else {
          resultaat = await migratie.up(conn);
          if (resultaat !== "overgeslagen") await conn.insertInto(TABEL).values({ naam: migratie.naam }).execute();
        }
        if (resultaat === "overgeslagen") {
          meldOvergeslagen(migratie, log);
          continue;
        }
        uitgevoerd.push(migratie.naam);
      }
    } finally {
      // Is de verbinding zelf weg, dan verdwijnt de sessie-lock mee met de
      // sessie. Een fout bij het vrijgeven mag de oorspronkelijke fout dan niet
      // verbergen.
      try {
        await sql`EXEC sp_releaseapplock @Resource = ${TABEL}, @LockOwner = 'Session'`.execute(conn);
      } catch (error) {
        const melding = losseFouten(error)
          .map((e) => (e instanceof Error ? e.message : String(e)))
          .join(" | ");
        log(`Migratielock vrijgeven mislukt (${melding}); de lock verdwijnt met de verbinding`);
      }
    }
  });

  return uitgevoerd;
}
