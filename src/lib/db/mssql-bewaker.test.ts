// Unittests voor de strenge SQL Server-plugin (npm run test:unit). Een Kysely
// met DummyDriver compileert en "voert uit" zonder server.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DummyDriver, Kysely, MssqlAdapter, MssqlIntrospector, MssqlQueryCompiler, sql, type KyselyPlugin } from "kysely";
import { MssqlBewaker, MssqlBewakerFout, mssqlPlugins } from "./mssql-bewaker";

type Db = { tags: { id: string; name: string; slug: string } };

function maakDb(plugins: KyselyPlugin[]) {
  return new Kysely<Db>({
    dialect: {
      createAdapter: () => new MssqlAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (k) => new MssqlIntrospector(k),
      createQueryCompiler: () => new MssqlQueryCompiler(),
    },
    plugins,
  });
}

const db = maakDb([new MssqlBewaker()]);

/** Bouwen en compileren moet weigeren (een subquery wordt al bij het bouwen gecontroleerd). */
function geweigerd(bouw: () => { compile(): unknown }, tekst: RegExp) {
  assert.throws(
    () => bouw().compile(),
    (err: unknown) => err instanceof MssqlBewakerFout && tekst.test(err.message)
  );
}

describe("MssqlBewaker", () => {
  it("laat geldige T-SQL ongewijzigd door", async () => {
    const bouw = (k: Kysely<Db>) =>
      k.selectFrom("tags").select(["id", "name"]).where("slug", "=", "x").orderBy("id").offset(0).fetch(10);
    const met = bouw(db).compile();
    const zonder = bouw(maakDb([])).compile();
    assert.equal(met.sql, zonder.sql);
    assert.deepEqual(met.parameters, zonder.parameters);
    assert.match(met.sql, /offset @2 rows fetch next @3 rows only$/);
    assert.match(db.selectFrom("tags").select("id").top(1).compile().sql, /^select top\(1\)/);
    assert.match(
      db.insertInto("tags").values({ id: "1", name: "a", slug: "a" }).outputAll("inserted").compile().sql,
      /output "inserted"\.\*/
    );
    // Uitvoeren met DummyDriver geeft lege resultaten, zonder fout.
    assert.deepEqual((await sql`select 1`.execute(db)).rows, []);
    assert.deepEqual(await bouw(db).execute(), []);
  });

  it("weigert .limit(), ook in een subquery", () => {
    geweigerd(() => db.selectFrom("tags").select("id").limit(1), /\.limit\(\)/);
    geweigerd(
      () => db.selectFrom("tags").select("id").where("id", "in", db.selectFrom("tags").select("id").limit(1)),
      /\.limit\(\)/
    );
  });

  it("weigert .fetch() zonder .offset(), rijvergrendeling en distinctOn", () => {
    geweigerd(() => db.selectFrom("tags").select("id").orderBy("id").fetch(1), /\.fetch\(\) zonder \.offset\(\)/);
    geweigerd(() => db.selectFrom("tags").select("id").forUpdate(), /rijvergrendeling/);
    geweigerd(() => db.selectFrom("tags").select("id").forShare(), /rijvergrendeling/);
    geweigerd(() => db.selectFrom("tags").select("id").distinctOn("slug"), /distinctOn/);
  });

  it("weigert returning, onConflict en ifNotExists", () => {
    geweigerd(() => db.insertInto("tags").values({ id: "1", name: "a", slug: "a" }).returningAll(), /returning/);
    geweigerd(() => db.updateTable("tags").set({ name: "b" }).returning("id"), /returning/);
    geweigerd(() => db.deleteFrom("tags").returning("id"), /returning/);
    geweigerd(
      () => db.insertInto("tags").values({ id: "1", name: "a", slug: "a" }).onConflict((oc) => oc.doNothing()),
      /onConflict/
    );
    geweigerd(() => db.schema.createTable("x").ifNotExists().addColumn("id", "integer"), /ifNotExists/);
    geweigerd(() => db.schema.createIndex("ix").ifNotExists().on("tags").column("slug"), /ifNotExists/);
  });

  it("mssqlPlugins: actief buiten productie, uit in productie", (t) => {
    const env = process.env as Record<string, string | undefined>;
    const oud = env.NODE_ENV;
    t.after(() => {
      if (oud === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = oud;
    });
    env.NODE_ENV = "production";
    assert.deepEqual(mssqlPlugins(), []);
    env.NODE_ENV = "development";
    assert.equal(mssqlPlugins().length, 1);
    assert.ok(mssqlPlugins()[0] instanceof MssqlBewaker);
  });
});
