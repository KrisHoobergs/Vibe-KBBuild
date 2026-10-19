// Unittests voor het luie SQL Server-dialect (npm run test:unit). Geen echte
// SQL Server nodig: de verbindingstest gebruikt een gesloten poort op 127.0.0.1.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import { Kysely, MssqlDialect, sql } from "kysely";
import type { MssqlDbConfig } from "@/lib/config";
import { maakKysely } from "./connection";
import { maakMssqlDialect } from "./mssql-dialect";
import type { Database } from "./schema";

// Houdt bij of tedious (of zijn Azure-afhankelijkheden) geladen wordt.
const geladen: string[] = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    const r = nextResolve(specifier, context);
    if (/[\\/]node_modules[\\/](tedious|@azure)[\\/]/.test(r.url)) geladen.push(r.url);
    return r;
  },
});

const CONFIG: MssqlDbConfig = {
  dialect: "mssql",
  server: "127.0.0.1",
  port: 1, // gesloten poort: de verbinding wordt meteen geweigerd
  database: "kennisbank",
  auth: { type: "sql", user: "kb_app", password: "geheim-wachtwoord" },
  encrypt: true,
  trustServerCertificate: true,
  poolMax: 1,
};

describe("maakMssqlDialect", () => {
  it("is een MssqlDialect (Better Auth herkent het zo) en laadt tedious niet vooraf", async () => {
    const dialect = maakMssqlDialect(CONFIG);
    assert.ok(dialect instanceof MssqlDialect);
    const db = new Kysely<Database>({ dialect });
    const q = db.selectFrom("tags").select(["id", "name"]).orderBy("name").orderBy("id").offset(0).fetch(5).compile();
    assert.match(q.sql, /^select "id", "name" from "tags" order by "name", "id" offset @1 rows fetch next @2 rows only$/);
    // Afsluiten zonder ooit een query uit te voeren: geen driver geladen.
    await db.destroy();
    const viaConnection = maakKysely(CONFIG);
    assert.equal(viaConnection.pgPool, undefined);
    await viaConnection.db.destroy();
    assert.deepEqual(geladen, []);
  });

  it("gesloten poort: snel een ESOCKET-fout, zonder wachtwoord of gebruiker in de melding", async () => {
    const { db } = maakKysely(CONFIG, { verbindingsTimeoutMs: 5_000 });
    const start = Date.now();
    try {
      await assert.rejects(sql`SELECT 1`.execute(db), (err: unknown) => {
        const e = err as { code?: unknown; message?: unknown };
        assert.equal(e.code, "ESOCKET");
        assert.doesNotMatch(String(e.message), /geheim-wachtwoord|kb_app/);
        return true;
      });
    } finally {
      await db.destroy();
    }
    // propagateCreateError: niet wachten tot de acquire-timeout (10 s).
    assert.ok(Date.now() - start < 4_000, `duurde ${Date.now() - start} ms`);
    assert.ok(geladen.some((u) => u.includes("tedious")), "tedious had nu geladen moeten zijn");
  });
});
