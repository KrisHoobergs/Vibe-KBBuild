import { sql, type Kysely } from "kysely";

// Kleine migratierunner voor installaties zonder Supabase (gewone PostgreSQL en
// SQL Server). Supabase-installaties gebruiken deze runner NOOIT: daar blijven
// migraties handwerk (supabase/migrations, alleen na akkoord).
//
// Migraties zijn TS-modules, zodat ze mee in de build zitten. Een migratie die
// niet in een transactie kan (bv. full-text-DDL op SQL Server) zet
// `transactioneel: false`.

export type Dialect = "postgres" | "mssql";

export type Migratie = {
  naam: string;
  transactioneel: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  up(db: Kysely<any>): Promise<void>;
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
    await sql`
      IF OBJECT_ID(N'dbo.kb_migrations', N'U') IS NULL
      CREATE TABLE dbo.kb_migrations (
        naam VARCHAR(200) NOT NULL CONSTRAINT PK_kb_migrations PRIMARY KEY,
        uitgevoerd_op DATETIME2(3) NOT NULL CONSTRAINT DF_kb_migrations_op DEFAULT SYSUTCDATETIME()
      )
    `.execute(db);
  }
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
 * Voert alle nog niet uitgevoerde migraties uit, in volgorde, op één vaste
 * verbinding met een lock, zodat twee processen nooit tegelijk migreren.
 * Geeft de namen terug van de migraties die nu zijn uitgevoerd.
 */
export async function migreer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  dialect: Dialect,
  migraties: Migratie[],
  log: (bericht: string) => void = console.log
): Promise<string[]> {
  const uitgevoerd: string[] = [];

  await weigerSupabaseDatabase(db, dialect);

  await db.connection().execute(async (conn) => {
    if (dialect === "postgres") {
      await sql`SELECT pg_advisory_lock(hashtext(${TABEL}))`.execute(conn);
    } else {
      await sql`
        DECLARE @r INT;
        EXEC @r = sp_getapplock @Resource = ${TABEL}, @LockMode = 'Exclusive',
          @LockOwner = 'Session', @LockTimeout = 60000;
        IF @r < 0 THROW 50000, 'Kon de migratielock niet krijgen', 1;
      `.execute(conn);
    }

    try {
      await zorgVoorTabel(conn, dialect);

      const rijen = await conn.selectFrom(TABEL).select("naam").execute();
      const gedaan = new Set(rijen.map((r: { naam: string }) => r.naam));

      for (const migratie of migraties) {
        if (gedaan.has(migratie.naam)) continue;

        log(`Migratie ${migratie.naam} …`);
        if (migratie.transactioneel) {
          await conn.transaction().execute(async (trx) => {
            await migratie.up(trx);
            await trx.insertInto(TABEL).values({ naam: migratie.naam }).execute();
          });
        } else {
          await migratie.up(conn);
          await conn.insertInto(TABEL).values({ naam: migratie.naam }).execute();
        }
        uitgevoerd.push(migratie.naam);
      }
    } finally {
      if (dialect === "postgres") {
        await sql`SELECT pg_advisory_unlock(hashtext(${TABEL}))`.execute(conn);
      } else {
        await sql`EXEC sp_releaseapplock @Resource = ${TABEL}, @LockOwner = 'Session'`.execute(conn);
      }
    }
  });

  return uitgevoerd;
}
