// Unittests voor de migratierunner en de SQL Server-migraties (npm run
// test:unit). Geen database nodig: een opname-driver noteert elke query en
// geeft een vooraf bepaald antwoord. De echte test tegen SQL Server is
// `npm run db:test:migraties:mssql`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Kysely,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  sql,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import { migreer, type Migratie } from "./migrate";
import { MssqlBewaker } from "./mssql-bewaker";
import { mssqlBasisMigraties, mssqlMigraties } from "./migrations/mssql";
import { fulltext } from "./migrations/mssql/0005_fulltext";
import { postgresMigraties } from "./migrations/postgres";

type Opname = { sql: string; parameters: readonly unknown[] };

/** Kysely zonder server: noteert elke query (en BEGIN/COMMIT/ROLLBACK). */
function opnameDb(dialect: "mssql" | "postgres", antwoord: (q: CompiledQuery) => unknown[] = () => []) {
  const opnames: Opname[] = [];
  const verbinding: DatabaseConnection = {
    async executeQuery<R>(q: CompiledQuery): Promise<QueryResult<R>> {
      opnames.push({ sql: q.sql.replace(/\s+/g, " ").trim(), parameters: q.parameters });
      return { rows: antwoord(q) as R[] };
    },
    async *streamQuery() {
      throw new Error("niet gebruikt");
    },
  };
  const driver: Driver = {
    async init() {},
    async acquireConnection() {
      return verbinding;
    },
    async beginTransaction() {
      opnames.push({ sql: "BEGIN", parameters: [] });
    },
    async commitTransaction() {
      opnames.push({ sql: "COMMIT", parameters: [] });
    },
    async rollbackTransaction() {
      opnames.push({ sql: "ROLLBACK", parameters: [] });
    },
    async releaseConnection() {},
    async destroy() {},
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => (dialect === "mssql" ? new MssqlAdapter() : new PostgresAdapter()),
      createDriver: () => driver,
      createIntrospector: (k) => (dialect === "mssql" ? new MssqlIntrospector(k) : new PostgresIntrospector(k)),
      createQueryCompiler: () => (dialect === "mssql" ? new MssqlQueryCompiler() : new PostgresQueryCompiler()),
    },
    // De strenge plugin: de runner mag geen ongeldige T-SQL bouwen.
    plugins: dialect === "mssql" ? [new MssqlBewaker()] : [],
  });
  return { db, opnames };
}

function testMigratie(naam: string, opties: { transactioneel?: boolean; overslaan?: boolean } = {}): Migratie {
  return {
    naam,
    transactioneel: opties.transactioneel ?? true,
    overslaanReden: opties.overslaan ? "test" : undefined,
    async up(db) {
      await sql`SELECT ${naam} AS migratie`.execute(db);
      if (opties.overslaan) return "overgeslagen";
    },
  };
}

describe("migreer: Postgres", () => {
  it("voert dezelfde SQL uit als voorheen; een overgeslagen migratie wordt niet bewaard", async () => {
    const { db, opnames } = opnameDb("postgres");
    const log: string[] = [];
    const uitgevoerd = await migreer(
      db,
      "postgres",
      [testMigratie("a"), testMigratie("b", { overslaan: true }), testMigratie("c")],
      (b) => log.push(b)
    );
    assert.deepEqual(uitgevoerd, ["a", "c"]);
    assert.deepEqual(
      opnames.map((o) => o.sql),
      [
        "SELECT ( to_regclass('auth.users') IS NOT NULL OR to_regclass('storage.buckets') IS NOT NULL OR to_regnamespace('supabase_migrations') IS NOT NULL ) AS supabase",
        "BEGIN",
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        "CREATE TABLE IF NOT EXISTS kb_migrations ( naam VARCHAR(200) PRIMARY KEY, uitgevoerd_op TIMESTAMPTZ NOT NULL DEFAULT now() )",
        'select "naam" from "kb_migrations"',
        "SELECT $1 AS migratie",
        'insert into "kb_migrations" ("naam") values ($1)',
        "SELECT $1 AS migratie",
        "SELECT $1 AS migratie",
        'insert into "kb_migrations" ("naam") values ($1)',
        "COMMIT",
      ]
    );
    assert.deepEqual(log, ["Migratie a …", "Migratie b …", "Migratie b overgeslagen: test", "Migratie c …"]);
  });

  it("slaat al uitgevoerde migraties over", async () => {
    const { db } = opnameDb("postgres", (q) => (q.sql.includes('from "kb_migrations"') ? [{ naam: "a" }] : []));
    assert.deepEqual(await migreer(db, "postgres", [testMigratie("a"), testMigratie("b")], () => {}), ["b"]);
  });

  it("de Postgres-lijst is ongewijzigd", () => {
    assert.deepEqual(
      postgresMigraties.map((m) => m.naam),
      ["0001_basis", "0002_auth", "0003_password_resets", "0004_files"]
    );
  });
});

describe("migreer: SQL Server", () => {
  it("lock eerst, per migratie een transactie, overgeslagen niet bewaard, lock vrij", async () => {
    const { db, opnames } = opnameDb("mssql");
    const log: string[] = [];
    const uitgevoerd = await migreer(
      db,
      "mssql",
      [
        testMigratie("a"),
        testMigratie("b", { overslaan: true }),
        testMigratie("c", { transactioneel: false, overslaan: true }),
        testMigratie("d", { transactioneel: false }),
      ],
      (b) => log.push(b)
    );
    assert.deepEqual(uitgevoerd, ["a", "d"]);
    const s = opnames.map((o) => o.sql);
    assert.match(s[0], /^DECLARE @r INT; EXEC @r = sp_getapplock @Resource = @1/);
    assert.match(s.at(-1)!, /^EXEC sp_releaseapplock @Resource = @1, @LockOwner = 'Session'$/);
    const inserts = opnames.filter((o) => o.sql.startsWith("insert into")).map((o) => o.parameters[0]);
    assert.deepEqual(inserts, ["a", "d"]);
    // a en b elk in een eigen transactie; c en d zonder.
    assert.equal(s.filter((x) => x === "BEGIN").length, 2);
    assert.equal(s.filter((x) => x === "COMMIT").length, 2);
    assert.deepEqual(
      log.filter((l) => l.includes("overgeslagen")),
      ["Migratie b overgeslagen: test", "Migratie c overgeslagen: test"]
    );
  });

  it("een fout bij het vrijgeven van de lock verbergt de echte fout niet", async () => {
    const { db } = opnameDb("mssql", (q) => {
      if (q.sql.includes("sp_releaseapplock")) throw new Error("Connection closed before request completed.");
      return [];
    });
    const kapot: Migratie = {
      naam: "kapot",
      transactioneel: true,
      async up() {
        throw Object.assign(new Error("echte fout"), { number: 50000 });
      },
    };
    const log: string[] = [];
    await assert.rejects(migreer(db, "mssql", [kapot], (b) => log.push(b)), /echte fout/);
    assert.ok(log.some((l) => l.startsWith("Migratielock vrijgeven mislukt (Connection closed")), log.join("\n"));
  });
});

describe("SQL Server-migraties", () => {
  it("dezelfde namen als Postgres, plus 0005_fulltext; basislijst zonder login", () => {
    assert.deepEqual(
      mssqlMigraties.map((m) => m.naam),
      [...postgresMigraties.map((m) => m.naam), "0005_fulltext"]
    );
    assert.deepEqual(
      mssqlBasisMigraties.map((m) => m.naam),
      ["0001_basis", "0005_fulltext"]
    );
    assert.deepEqual(
      mssqlMigraties.map((m) => m.transactioneel),
      [true, true, true, true, false]
    );
  });

  it("0001-0004: geldige vorm (dbo., geen parameters, idempotent, geen triggers, nvarchar)", async () => {
    const { db, opnames } = opnameDb("mssql");
    for (const m of mssqlMigraties.slice(0, 4)) assert.equal(await m.up(db), undefined);
    assert.ok(opnames.length > 0);
    let tabellen = 0;
    for (const { sql: s, parameters } of opnames) {
      assert.deepEqual(parameters, [], `parameters in DDL: ${s}`);
      assert.doesNotMatch(s, /(^|\s)GO(\s|$)/, s);
      assert.doesNotMatch(s, /TRIGGER/i, s);
      assert.doesNotMatch(s, /(?<!n)varchar|\bdatetime\b(?!2)|\btext\b|uniqueidentifier/i, s);
      for (const [, tabel] of s.matchAll(/CREATE TABLE (\S+)/g)) {
        tabellen++;
        assert.match(tabel, /^dbo\.\w+$/, s);
        assert.ok(s.startsWith(`IF OBJECT_ID(N'${tabel}', N'U') IS NULL CREATE TABLE ${tabel} `), s);
      }
      for (const [, doel] of s.matchAll(/REFERENCES (\S+)/g)) assert.match(doel, /^dbo\.\w+$/, s);
      if (/CREATE INDEX/.test(s)) {
        assert.match(s, /^IF NOT EXISTS \(SELECT 1 FROM sys\.indexes WHERE object_id = OBJECT_ID\(N'dbo\.\w+'\) AND name = N'[\w]+'\) CREATE INDEX "?\w+"? ON dbo\./, s);
      }
    }
    assert.equal(tabellen, 12);
    // De verwijzingen waar SQL Server geen tweede cascadepad toelaat: NO ACTION.
    const ddl = opnames.map((o) => o.sql).join("\n");
    assert.match(ddl, /CONSTRAINT FK_articles_reviewer REFERENCES dbo\.profiles \("id"\),/);
    assert.match(ddl, /CONSTRAINT FK_password_resets_created_by REFERENCES dbo\.profiles \("id"\),/);
    assert.match(ddl, /"search_text" AS CONCAT\("title", NCHAR\(10\), "excerpt", NCHAR\(10\), "content_text"\) PERSISTED/);
  });

  it("0005 zonder Full-Text Search of zonder Nederlands: overgeslagen, zonder DDL", async () => {
    for (const rij of [{ fts: 0, nederlands: 0 }, { fts: 1, nederlands: 0 }, { fts: null, nederlands: 0 }]) {
      const { db, opnames } = opnameDb("mssql", () => [rij]);
      assert.equal(await fulltext.up(db), "overgeslagen");
      assert.equal(opnames.length, 1);
      assert.match(opnames[0].sql, /FULLTEXTSERVICEPROPERTY\('IsFullTextInstalled'\)/);
    }
  });

  it("0005 met full-text: catalogus en index, idempotent, zonder stoplijst", async () => {
    const { db, opnames } = opnameDb("mssql", () => [{ fts: 1, nederlands: 1 }]);
    assert.equal(await fulltext.up(db), undefined);
    const [, catalogus, index] = opnames.map((o) => o.sql);
    assert.equal(
      catalogus,
      "IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'kb_fulltext') CREATE FULLTEXT CATALOG kb_fulltext WITH ACCENT_SENSITIVITY = OFF"
    );
    assert.equal(
      index,
      "IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'dbo.articles')) " +
        'CREATE FULLTEXT INDEX ON dbo.articles ( "search_text" LANGUAGE 1043, "title" LANGUAGE 1043, "excerpt" LANGUAGE 1043 ) ' +
        "KEY INDEX PK_articles ON kb_fulltext WITH (CHANGE_TRACKING = AUTO, STOPLIST = OFF)"
    );
    assert.ok(opnames.every((o) => o.parameters.length === 0));
  });
});
