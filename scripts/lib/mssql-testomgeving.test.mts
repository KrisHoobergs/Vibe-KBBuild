// Unittests voor de beveiliging van de SQL Server-testscripts (npm run
// test:unit): alleen een gemarkeerde database met een testnaam.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DummyDriver,
  Kysely,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
  type DatabaseConnection,
  type QueryResult,
} from "kysely";
import { assertMssqlTestdatabase, TESTDATABASE_NAAM, weigeringTestdatabase } from "./mssql-testomgeving.mjs";

/** Een Kysely die op elke query één vaste rij teruggeeft. */
function nepDb(rij: Record<string, unknown>) {
  const driver = new DummyDriver();
  driver.acquireConnection = async (): Promise<DatabaseConnection> => ({
    async executeQuery<R>(): Promise<QueryResult<R>> {
      return { rows: [rij as R] };
    },
    async *streamQuery() {
      throw new Error("niet gebruikt");
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kysely<any>({
    dialect: {
      createAdapter: () => new MssqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MssqlIntrospector(k),
      createQueryCompiler: () => new MssqlQueryCompiler(),
    },
  });
}

describe("testdatabase-beveiliging", () => {
  it("naamregel: kb_test… en kennisbank_test… (en …_pariteit), niets anders", () => {
    for (const naam of ["kb_test", "KB_TEST_2", "kennisbank_test", "kennisbank_test_ci", "kb_pariteit", "kennisbank_pariteit"]) {
      assert.ok(TESTDATABASE_NAAM.test(naam), naam);
    }
    for (const naam of ["kennisbank", "kb", "test_kb", "kbtest", "kennisbank-test", "kennisbanktest", "productie_kb_test", "master"]) {
      assert.ok(!TESTDATABASE_NAAM.test(naam), naam);
    }
  });

  it("weigert een andere naam, een ontbrekende of verkeerde markering", () => {
    assert.equal(weigeringTestdatabase({ naam: "kennisbank_test", markering: "ja" }), null);
    assert.match(weigeringTestdatabase({ naam: "kennisbank", markering: "ja" }) ?? "", /geen testdatabase/);
    assert.match(weigeringTestdatabase({ naam: "kennisbank_test", markering: null }) ?? "", /markering/);
    assert.match(weigeringTestdatabase({ naam: "kb_test", markering: "nee" }) ?? "", /markering/);
    assert.match(weigeringTestdatabase({ naam: null, markering: "ja" }) ?? "", /geen testdatabase/);
  });

  it("assertMssqlTestdatabase vraagt het aan de database zelf", async () => {
    await assertMssqlTestdatabase(nepDb({ naam: "kennisbank_test", markering: "ja", sysadmin: 0 }));
    await assert.rejects(assertMssqlTestdatabase(nepDb({ naam: "kennisbank", markering: "ja", sysadmin: 0 })), /geen testdatabase/);
    await assert.rejects(assertMssqlTestdatabase(nepDb({ naam: "kb_test", markering: null, sysadmin: 0 })), /markering/);
  });
});
