// Unittests voor het luie SQL Server-dialect (npm run test:unit). Geen echte
// SQL Server nodig: de verbindingstest gebruikt een gesloten poort op 127.0.0.1.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import { Kysely, MssqlDialect, sql } from "kysely";
import type { MssqlDbConfig } from "@/lib/config";
import { isVerbindingsfout } from "./auto-migrate";
import { maakKysely } from "./connection";
import { maakMssqlDialect, markeerTijdelijkeAanmeldfout } from "./mssql-dialect";
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

/**
 * Een nagemaakte tedious-verbinding: connect() stuurt de opgegeven
 * foutnummers als errorMessage-tokens en eindigt zoals tedious bij een
 * mislukte aanmelding: met één ConnectionError ELOGIN (de laatste fout).
 */
function nepVerbinding(nummers: number[], fout = true) {
  const c = new EventEmitter() as EventEmitter & { connect: (cb?: (err?: Error) => void) => void };
  c.connect = (cb) => {
    for (const number of nummers) c.emit("errorMessage", { number, message: `fout ${number}` });
    cb?.(fout ? Object.assign(new Error("Login failed for user 'kb'."), { code: "ELOGIN" }) : undefined);
  };
  markeerTijdelijkeAanmeldfout(c as unknown as Parameters<typeof markeerTijdelijkeAanmeldfout>[0]);
  return c;
}

const verbind = (c: ReturnType<typeof nepVerbinding>) =>
  new Promise<(Error & { isTransient?: boolean }) | undefined>((resolve) => c.connect((err) => resolve(err)));

describe("markeerTijdelijkeAanmeldfout", () => {
  it("4060 (database nog aan het herstellen) en daarna 18456: tijdelijk, dus opnieuw proberen", async () => {
    const err = await verbind(nepVerbinding([4060, 18456]));
    assert.equal(err?.isTransient, true);
    assert.equal(isVerbindingsfout(err), true);
  });

  it("de andere tijdelijke fouten (Azure SQL) ook", async () => {
    for (const n of [40613, 40197, 40501, 10928, 10929]) {
      assert.equal((await verbind(nepVerbinding([n, 18456])))?.isTransient, true, String(n));
    }
  });

  it("een losse 18456 (verkeerd wachtwoord) blijft niet-tijdelijk: geen herhaalde pogingen", async () => {
    const err = await verbind(nepVerbinding([18456]));
    assert.equal(err?.isTransient, undefined);
    assert.equal(isVerbindingsfout(err), false);
  });

  it("geslaagde aanmelding: geen fout, en de luisteraar is daarna weg", async () => {
    const c = nepVerbinding([], false);
    assert.equal(c.listenerCount("errorMessage"), 1);
    assert.equal(await verbind(c), undefined);
    assert.equal(c.listenerCount("errorMessage"), 0);
  });

  it("serverfouten na het aanmelden tellen niet mee", async () => {
    const c = nepVerbinding([], false);
    await verbind(c);
    // Een query-fout 4060 later (bv. USE op een database in herstel) verandert niets meer.
    c.emit("errorMessage", { number: 4060, message: "fout 4060" });
    assert.equal(c.listenerCount("errorMessage"), 0);
  });
});
