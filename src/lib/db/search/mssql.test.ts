// Unittests voor het zoeken op SQL Server (npm run test:unit). Geen server
// nodig: een nep-verbinding noteert elke query (met de echte
// MssqlQueryCompiler van Kysely) en geeft een vooraf bepaald antwoord. De echte
// test tegen SQL Server zit in `npm run db:test:mssql`.
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  Kysely,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import type { Database } from "@/lib/db/schema";
import { resetFulltextStatus, zoekMssql } from "./mssql";
import type { ZoekParams } from "./types";

type Antwoord = (q: CompiledQuery) => unknown[];

function nepDb(antwoord: Antwoord) {
  const log: CompiledQuery[] = [];
  const verbinding: DatabaseConnection = {
    async executeQuery<R>(q: CompiledQuery): Promise<QueryResult<R>> {
      log.push(q);
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
    async beginTransaction() {},
    async commitTransaction() {},
    async rollbackTransaction() {},
    async releaseConnection() {},
    async destroy() {},
  };
  const db = new Kysely<Database>({
    dialect: {
      createAdapter: () => new MssqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MssqlIntrospector(k),
      createQueryCompiler: () => new MssqlQueryCompiler(),
    },
  });
  return { db, log };
}

const isControle = (q: CompiledQuery) => q.sql.includes("TableHasActiveFulltextIndex");
const isFulltext = (q: CompiledQuery) => q.sql.includes("CONTAINSTABLE");
const isLike = (q: CompiledQuery) => q.sql.includes(" LIKE ") && !isFulltext(q);
const soort = (q: CompiledQuery) => (isControle(q) ? "controle" : isFulltext(q) ? "full-text" : isLike(q) ? "like" : "?");

/**
 * Antwoord van een server met (of zonder) full-text-index; zoekvragen geven
 * niets. Standaard SQL Server 2025 (hoofdversie 17).
 */
const server = (index: boolean, zoek: Antwoord = () => [], hoofdversie: number | null = 17): Antwoord => (q) =>
  isControle(q) ? [{ actief: index ? 1 : 0, hoofdversie }] : zoek(q);

/** Een serverfout zoals Kysely-mssql ze geeft: een array van fouten met een nummer. */
const serverfout = (...nummers: number[]) =>
  nummers.map((n) => Object.assign(new Error(`fout ${n}`), { number: n, code: "EREQUEST" }));

const basis: ZoekParams = { query: "printer", tagSlugs: null, statuses: ["published"], limit: 20, offset: 0 };

/** De laatste twee parameters van de zoekquery: OFFSET en FETCH NEXT. */
function offsetEnLimiet(q: CompiledQuery): [unknown, unknown] {
  const p = q.parameters;
  return [p[p.length - 2], p[p.length - 1]];
}

beforeEach(() => resetFulltextStatus());

describe("zoekMssql: keuze tussen full-text en LIKE", () => {
  it("met full-text-index: CONTAINSTABLE op search_text, met bonus op titel en excerpt", async () => {
    const { db, log } = nepDb(server(true));
    await zoekMssql(db, { ...basis, query: 'printer installeren -windows "exacte zin"' });
    assert.deepEqual(log.map(soort), ["controle", "full-text"]);
    const q = log[1];
    assert.match(q.sql, /FROM CONTAINSTABLE\(dbo\.articles, search_text, @1, LANGUAGE 1043\) AS ct/);
    assert.match(q.sql, /LEFT JOIN CONTAINSTABLE\(dbo\.articles, title, @2, LANGUAGE 1043\)/);
    assert.match(q.sql, /LEFT JOIN CONTAINSTABLE\(dbo\.articles, excerpt, @3, LANGUAGE 1043\)/);
    assert.match(q.sql, /ORDER BY \[rank\] DESC, a\.updated_at DESC, a\.id/);
    assert.equal(
      q.parameters[0],
      'FORMSOF(INFLECTIONAL, "printer") AND FORMSOF(INFLECTIONAL, "installeren") AND "exacte zin" AND NOT FORMSOF(INFLECTIONAL, "windows")'
    );
    assert.equal(q.parameters[1], 'FORMSOF(INFLECTIONAL, "printer") OR FORMSOF(INFLECTIONAL, "installeren") OR "exacte zin"');
    // De zoektekst zit nooit in de SQL zelf.
    assert.ok(!q.sql.includes("printer") && !q.sql.includes("windows"));
  });

  it("zonder full-text-index: LIKE op search_text, accentongevoelig, met ESCAPE", async () => {
    const { db, log } = nepDb(server(false));
    await zoekMssql(db, { ...basis, query: "artikelen kat_hond -concept" });
    assert.deepEqual(log.map(soort), ["controle", "like"]);
    const q = log[1];
    const waarden = (re: RegExp) => [...q.sql.matchAll(re)].map((m) => q.parameters[Number(m[1]) - 1]);
    assert.deepEqual(waarden(/a\.search_text COLLATE Latin1_General_100_CI_AI LIKE @(\d+) ESCAPE '!'/g), [
      "%artikel%",
      "%kat!_hond%",
    ]);
    assert.deepEqual(waarden(/a\.search_text COLLATE Latin1_General_100_CI_AI NOT LIKE @(\d+) ESCAPE '!'/g), ["%concept%"]);
    // Rang: titel, excerpt en inhoud per positieve term; de uitsluiting telt niet mee.
    assert.deepEqual(waarden(/a\.title COLLATE Latin1_General_100_CI_AI LIKE @(\d+)/g), ["%artikel%", "%kat!_hond%"]);
    assert.match(q.sql, /THEN 1\.0 ELSE 0 END\s+\+ CASE WHEN a\.excerpt .* THEN 0\.4 ELSE 0 END\s+\+ CASE WHEN a\.content_text .* THEN 0\.2/);
    assert.ok(!q.sql.includes("artikel") && !q.sql.includes("concept"));
  });

  it("de controle op de index (en de hoofdversie) wordt 5 minuten bewaard", async () => {
    const { db, log } = nepDb(server(true));
    await zoekMssql(db, basis);
    await zoekMssql(db, { ...basis, query: "scanner" });
    assert.deepEqual(log.map(soort), ["controle", "full-text", "full-text"]);
    assert.match(log[0].sql, /SERVERPROPERTY\('ProductMajorVersion'\)/);
  });

  it("SQL Server 2016–2022 (hoofdversie < 17): elk woord ook op het begin van zijn ruwe stam", async () => {
    for (const hoofdversie of [13, 16]) {
      resetFulltextStatus();
      const { db, log } = nepDb(server(true, () => [], hoofdversie));
      await zoekMssql(db, { ...basis, query: 'artikelen kat -printers "exacte zin"' });
      await zoekMssql(db, { ...basis, query: "printers" });
      assert.deepEqual(log.map(soort), ["controle", "full-text", "full-text"]);
      assert.equal(
        log[1].parameters[0],
        '(FORMSOF(INFLECTIONAL, "artikelen") OR "artikel*") AND FORMSOF(INFLECTIONAL, "kat") AND "exacte zin" AND NOT FORMSOF(INFLECTIONAL, "printers")'
      );
      assert.equal(
        log[1].parameters[1],
        '(FORMSOF(INFLECTIONAL, "artikelen") OR "artikel*") OR FORMSOF(INFLECTIONAL, "kat") OR "exacte zin"'
      );
      // Bewaard samen met de index: ook de tweede zoekvraag krijgt het prefix.
      assert.equal(log[2].parameters[0], '(FORMSOF(INFLECTIONAL, "printers") OR "printer*")');
    }
  });

  it("SQL Server 2025 of een onbekende versie: geen stamprefix", async () => {
    for (const hoofdversie of [17, null]) {
      resetFulltextStatus();
      const { db, log } = nepDb(server(true, () => [], hoofdversie));
      await zoekMssql(db, { ...basis, query: "artikelen" });
      assert.equal(log[1].parameters[0], 'FORMSOF(INFLECTIONAL, "artikelen")');
      assert.equal(log[1].parameters[1], 'FORMSOF(INFLECTIONAL, "artikelen")');
    }
  });

  it("2016–2022 zonder full-text-index: LIKE met de ruwe stam, zoals voorheen", async () => {
    const { db, log } = nepDb(server(false, () => [], 15));
    await zoekMssql(db, { ...basis, query: "artikelen" });
    assert.deepEqual(log.map(soort), ["controle", "like"]);
    assert.ok(log[1].parameters.includes("%artikel%"));
  });

  it("full-text-fout (bv. 7609): terugval op LIKE en 5 minuten geen full-text", async () => {
    const { db, log } = nepDb(
      server(true, (q) => {
        if (isFulltext(q)) throw serverfout(7609);
        return [{ id: "x" }];
      })
    );
    const fouten: unknown[] = [];
    const origineel = console.error;
    console.error = (...a: unknown[]) => void fouten.push(a[0]);
    try {
      assert.deepEqual(await zoekMssql(db, basis), [{ id: "x" }]);
      await zoekMssql(db, { ...basis, query: "scanner" });
    } finally {
      console.error = origineel;
    }
    assert.deepEqual(log.map(soort), ["controle", "full-text", "like", "like"]);
    assert.match(String(fouten[0]), /^\[zoeken\] full-text-fout 7609, terugval op LIKE/);
  });

  it("syntaxfout in één zoekvraag (7630): LIKE voor die vraag, full-text blijft aan", async () => {
    let eerste = true;
    const { db, log } = nepDb(
      server(true, (q) => {
        if (isFulltext(q) && eerste) {
          eerste = false;
          throw serverfout(7630);
        }
        return [];
      })
    );
    const origineel = console.error;
    console.error = () => {};
    try {
      await zoekMssql(db, basis);
      await zoekMssql(db, basis);
    } finally {
      console.error = origineel;
    }
    assert.deepEqual(log.map(soort), ["controle", "full-text", "like", "full-text"]);
  });

  it("een andere fout (bv. 207) gaat gewoon door", async () => {
    const { db } = nepDb(
      server(true, () => {
        throw serverfout(207);
      })
    );
    await assert.rejects(zoekMssql(db, basis), (err: unknown) => Array.isArray(err) && (err[0] as { number: number }).number === 207);
  });
});

describe("zoekMssql: invoer", () => {
  it("niets om op te zoeken: geen enkele query", async () => {
    const { db, log } = nepDb(server(true));
    for (const query of ["", "de het een", "-uitsluiten", "!!!", '""']) {
      assert.deepEqual(await zoekMssql(db, { ...basis, query }), []);
    }
    assert.equal(log.length, 0);
  });

  it("geen status: niets (zoals status = ANY('{}') in Postgres), zonder query", async () => {
    const { db, log } = nepDb(server(true));
    assert.deepEqual(await zoekMssql(db, { ...basis, statuses: [] }), []);
    assert.equal(log.length, 0);
  });

  it("limiet 1…50 en offset ≥ 0, altijd gehele getallen", async () => {
    const gevallen: [number, number, number, number][] = [
      [20, 0, 0, 20],
      [0, -5, 0, 1],
      [-3, 10, 10, 1],
      [1000, 2.7, 2, 50],
      [7.9, 40, 40, 7],
      [Number.NaN, Number.NaN, 0, 20],
      [Number.POSITIVE_INFINITY, 1e15, 2_147_483_647, 20],
    ];
    for (const index of [true, false]) {
      for (const [limit, offset, verwachtOffset, verwachtLimiet] of gevallen) {
        resetFulltextStatus();
        const { db, log } = nepDb(server(index));
        await zoekMssql(db, { ...basis, limit, offset });
        assert.deepEqual(offsetEnLimiet(log[1]), [verwachtOffset, verwachtLimiet], `${limit}/${offset}`);
        assert.match(log[1].sql, /OFFSET @\d+ ROWS FETCH NEXT @\d+ ROWS ONLY\s*$/);
      }
    }
  });

  it("tagfilter met AND: dubbele slugs één keer, HAVING telt de unieke", async () => {
    const { db, log } = nepDb(server(false));
    await zoekMssql(db, { ...basis, tagSlugs: ["alfa", "beta", "alfa"], statuses: ["draft", "published", "draft"] });
    const q = log[1];
    assert.match(q.sql, /a\.status IN \(@\d+, @\d+\) AND a\.id IN \(/);
    assert.match(q.sql, /WHERE t2\.slug IN \(@\d+, @\d+\)\s+GROUP BY at3\.article_id\s+HAVING COUNT\(DISTINCT t2\.slug\) = @\d+\)/);
    const p = q.parameters;
    assert.deepEqual(p.slice(p.length - 7, p.length - 2), ["draft", "published", "alfa", "beta", 2]);
  });

  it("zonder tagfilter (null of leeg): alleen de status", async () => {
    for (const tagSlugs of [null, []]) {
      resetFulltextStatus();
      const { db, log } = nepDb(server(true));
      await zoekMssql(db, { ...basis, tagSlugs });
      assert.ok(!log[1].sql.includes("HAVING"));
    }
  });

  it("tags als FOR JSON PATH (null zonder tags), nooit search_text in de SELECT", async () => {
    for (const index of [true, false]) {
      resetFulltextStatus();
      const { db, log } = nepDb(server(index));
      await zoekMssql(db, basis);
      const select = log[1].sql.split(/\bFROM\s+(CONTAINSTABLE|dbo\.articles AS a)\b/)[0];
      assert.match(select, /FOR JSON PATH\) AS tags/);
      assert.ok(!/search_text/.test(select), select);
    }
  });

  it("zeer lange invoer: voorwaarde blijft onder 4000 tekens", async () => {
    const { db, log } = nepDb(server(true));
    await zoekMssql(db, { ...basis, query: "printer ".repeat(1000) + "x".repeat(5000) });
    for (const p of log[1].parameters.slice(0, 3)) assert.ok(String(p).length < 4000);
  });
});
