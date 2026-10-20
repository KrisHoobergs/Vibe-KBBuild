/**
 * Full-text-controles op SQL Server, tegen een SQL Server-TESTdatabase
 * (MSSQL_TEST_* in .env.local of de omgeving). Aanvulling op
 * db:test:migraties:mssql (FT-5, FT-6) en db:test:mssql (FT-9, FT-11):
 *
 *   FT-1  omgeving: versie, Full-Text Search, Nederlands (1043), woordsplitser
 *   FT-2  de Nederlandse stemmer: FORMSOF(INFLECTIONAL, …) voor een paar woorden
 *   FT-3  woordsplitsing zonder stoplijst (c#, node.js, café, één, …)
 *   FT-4  grammatica: elke voorwaarde van de zoekparser (vaste lijst plus
 *         5000 willekeurige invoeren) is geldige CONTAINS-syntax
 *   FT-7  AND over kolommen: CONTAINS((title, excerpt), …) vindt een artikel
 *         met de woorden in verschillende kolommen niet, search_text wel
 *   FT-8  vertraging van CHANGE_TRACKING AUTO na een INSERT (gemiddelde en
 *         maximum) en na een UPDATE van alleen content_text
 *   FT-10 stamprefix (zo zoekt de app op SQL Server 2016–2022): met
 *         "artikel*" vinden artikel en artikelen elkaar op elke versie; toont
 *         ook wat FORMSOF alleen op deze server vindt (geen sysadmin nodig)
 *   FT-11 zonder Full-Text Search: geen index, 0005_fulltext niet vastgelegd
 *
 *   npm run test:fulltext:mssql
 *   npm run test:fulltext:mssql -- --metingen=20      (FT-8 met minder metingen; standaard 100)
 *
 * sys.dm_fts_parser (FT-2 … FT-4) vraagt sysadmin. Zet daarvoor
 * MSSQL_TEST_BEHEERDER_USER en MSSQL_TEST_BEHEERDER_PASSWORD (in CI: sa).
 * Zonder die twee worden FT-2 … FT-4 overgeslagen, behalve als
 * MSSQL_TEST_FULLTEXT_VERWACHT=1 (CI): dan is dat een fout.
 *
 * FT-2 eist vervoegingen (lopen, rood, artikel ↔ artikelen), behalve met
 * MSSQL_TEST_STEMMER_VERWACHT=0: dan worden de vormen alleen getoond (SQL
 * Server 2022 in CI: de stemmer geeft daar alleen het woord zelf terug; de app
 * vangt dat op met het stamprefix, FT-10). FT-10 eist vervoegingen van FORMSOF
 * alleen met MSSQL_TEST_STEMMER_VERWACHT=1.
 *
 * Weigert elke database die niet kb_test…/kennisbank_test… heet of de
 * markering kb_testdatabase mist (scripts/lib/mssql-testomgeving.mts). Voert
 * eerst de ontbrekende migraties uit. Alles wat de test aanmaakt, ruimt hij op.
 * Toont nooit serveradres, gebruiker of wachtwoord.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { sql, type Kysely } from "kysely";
import { assertMssqlTestdatabase, wachtOpZoekindex, zetMssqlTestomgeving } from "./lib/mssql-testomgeving.mjs";

zetMssqlTestomgeving();
const fulltextVerwacht = process.env.MSSQL_TEST_FULLTEXT_VERWACHT;
const stemmerVerwacht = process.env.MSSQL_TEST_STEMMER_VERWACHT;
const beheerderUser = process.env.MSSQL_TEST_BEHEERDER_USER;
const beheerderWachtwoord = process.env.MSSQL_TEST_BEHEERDER_PASSWORD;
const metingenArg = process.argv.find((a) => a.startsWith("--metingen="));
const METINGEN = metingenArg ? Number(metingenArg.slice("--metingen=".length)) : 100;
if (!Number.isInteger(METINGEN) || METINGEN < 1) throw new Error("--metingen= verwacht een positief geheel getal");

const { leesConfig } = await import("../src/lib/config");
const { maakKysely } = await import("../src/lib/db/connection");
const { foutNummers } = await import("../src/lib/db/dialect");
const { voerMigratiesUit } = await import("../src/lib/db/auto-migrate");
const { heeftOudeStemmer, naarBonus, naarContains, parseZoekvraag } = await import("../src/lib/db/search/mssql-query");

const config = leesConfig();
if (config.db.dialect !== "mssql") throw new Error("De testomgeving zette DB_DIALECT=mssql niet");
const mssqlConfig = config.db;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>;
const instanties: Db[] = [];
function nieuweDb(auth = mssqlConfig.auth, poolMax = 2): Db {
  const { db } = maakKysely({ ...mssqlConfig, auth, poolMax }, { requestTimeoutMs: 120_000 });
  instanties.push(db);
  return db;
}
const db = nieuweDb();
const beheerder =
  beheerderUser && beheerderWachtwoord
    ? nieuweDb({ type: "sql", user: beheerderUser, password: beheerderWachtwoord }, 4)
    : null;

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Een woord van alleen letters dat nergens anders voorkomt. */
const uniekWoord = () => `qz${Array.from(randomBytes(10), (b) => "abcdefghijklmnopqrstuvwxyz"[b % 26]).join("")}`;

let geslaagd = 0;
let overgeslagen = 0;
async function stap(naam: string, fn: () => Promise<void | "overgeslagen">) {
  const start = performance.now();
  try {
    const uitkomst = await fn();
    if (uitkomst === "overgeslagen") {
      overgeslagen++;
      console.log(`- ${naam}: overgeslagen`);
      return;
    }
    geslaagd++;
    console.log(`✓ ${naam} (${Math.round(performance.now() - start)} ms)`);
  } catch (err) {
    console.error(`✗ ${naam}`);
    throw err;
  }
}

/** Geeft de tokens van sys.dm_fts_parser (Nederlands, zonder stoplijst). */
async function parser(d: Db, voorwaarde: string) {
  const { rows } = await sql<{ display_term: string; expansion_type: number; special_term: string }>`
    SELECT display_term, expansion_type, special_term
    FROM sys.dm_fts_parser(${voorwaarde}, 1043, NULL, 0)
  `.execute(d);
  return rows;
}

// Testgebruiker en -artikels (FT-7, FT-8), op naam opgeruimd.
const PREFIX = `zz-ft-${Date.now()}`;
const auteurId = randomUUID();
let auteurGemaakt = false;

async function maakAuteur() {
  if (auteurGemaakt) return;
  await sql`
    INSERT INTO dbo.auth_users ("id", "name", "email", "emailVerified")
    VALUES (${auteurId}, ${`${PREFIX} auteur`}, ${`${PREFIX}@voorbeeld.be`}, 0)
  `.execute(db);
  auteurGemaakt = true;
  await sql`
    INSERT INTO dbo.profiles ("id", "email", "display_name")
    VALUES (${auteurId}, ${`${PREFIX}@voorbeeld.be`}, ${`${PREFIX} auteur`})
  `.execute(db);
}

async function maakArtikel(titel: string, excerpt: string | null, inhoud: string): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO dbo.articles ("id", "title", "slug", "content", "content_text", "excerpt", "status", "author_id")
    VALUES (${id}, ${`${PREFIX} ${titel}`}, ${`${PREFIX}-${id}`}, N'{}', ${inhoud}, ${excerpt}, N'published', ${auteurId})
  `.execute(db);
  return id;
}

async function aantalGevonden(voorwaarde: string): Promise<number> {
  const { rows } = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM CONTAINSTABLE(dbo.articles, search_text, ${voorwaarde}, LANGUAGE 1043)
  `.execute(db);
  return rows[0]?.n ?? 0;
}

async function opruimen() {
  await sql`DELETE FROM dbo.articles WHERE "author_id" = ${auteurId}`.execute(db);
  if (auteurGemaakt) {
    // profiles verdwijnt mee (FK_profiles_auth_users, ON DELETE CASCADE).
    await sql`DELETE FROM dbo.auth_users WHERE "id" = ${auteurId}`.execute(db);
  }
}

/** Deterministische toevalsgenerator (mulberry32): elke run dezelfde 5000 invoeren. */
function toeval(zaad: number) {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Invoer die de zoekparser moet overleven: operatoren, leestekens, accenten, stopwoorden. */
function willekeurigeInvoer(aantal: number): string[] {
  const r = toeval(20261019);
  const stukken = [
    "printer", "installeren", "artikelen", "kennisbank", "café", "één", "ideeën", "Œuvre", "Łódź", "straße",
    "de", "het", "een", "or", "OR", "and", "AND", "not", "NOT", "near", "NEAR", "FORMSOF", "ISABOUT", "inflectional",
    "c#", "c++", ".net", "node.js", "e-mail", "o'brien", "o’brien", "kat_hond", "v1.2.3", "100%", "2026-10-19",
    "a@b.be", "x/y", "a:b", "1,5", "🎉", "日本語", "-", "--", "+", "*", "**", "\"", "\"\"", "'", "’", "(", ")", "[", "]",
    "{", "}", "!", "&", "|", "<", ">", "<->", "~", "^", "%", "_", "\\", ";", "=", "$", "?", "@", "#", "…", "\t", "\n",
  ];
  const lijm = [" ", " ", " ", "", "-", "\"", " -", " or ", "\" ", " \""];
  const uit: string[] = [];
  for (let i = 0; i < aantal; i++) {
    const n = 1 + Math.floor(r() * 12);
    let s = "";
    for (let j = 0; j < n; j++) {
      s += stukken[Math.floor(r() * stukken.length)];
      s += lijm[Math.floor(r() * lijm.length)];
    }
    uit.push(r() < 0.02 ? s.repeat(60) : s);
  }
  return uit;
}

// Vaste lijst (dezelfde gevallen als in het ontwerp en de parsertests).
const VASTE_VRAGEN = [
  "artikelen", "printer installeren", '"exacte zin" rest', "foo -uitsluiten", "a or b", "kat hond or vis",
  "kat or hond vis", "kat or or hond", "kat -or hond", "c#", "C++", "node.js", "c# .net", "e-mail",
  "jan.janssens@voorbeeld.be", "v1.2.3", "100%", "o'brien", "kat_hond", "kat*hond", '"de printer van de afdeling"',
  'kat -"zwarte hond"', "-windows printer", "één ideeën", "café", "2026-10-19", "kat' ; DROP TABLE x; --",
  Array.from({ length: 40 }, (_, i) => `woord${i}`).join(" "), "x".repeat(600), "de het een", "or", "-", '""',
  "NEAR(kat, hond)", "FORMSOF(INFLECTIONAL, kat)", "kat AND NOT hond", "kat & hond | vis", "!kat", "kat <-> hond",
];

try {
  await stap("testdatabase gecontroleerd (naam en markering kb_testdatabase)", async () => {
    // Alleen de testlogin schrijft; de beheerder (sa) gebruikt alleen sys.dm_fts_parser.
    await assertMssqlTestdatabase(db);
  });

  await stap("migraties bijgewerkt", async () => {
    await voerMigratiesUit(() => {});
  });

  let fulltext = false;
  let hoofdversie = 0;
  await stap("FT-1 omgeving: versie, Full-Text Search, Nederlands", async () => {
    const { rows } = await sql<{
      versie: string;
      hoofdversie: number;
      editie: string;
      fts: number | null;
      nederlands: string | null;
      index_actief: number | null;
    }>`
      SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(30)) AS versie,
             CAST(SERVERPROPERTY('ProductMajorVersion') AS int) AS hoofdversie,
             CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS editie,
             CAST(FULLTEXTSERVICEPROPERTY('IsFullTextInstalled') AS int) AS fts,
             (SELECT name FROM sys.fulltext_languages WHERE lcid = 1043) AS nederlands,
             CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableHasActiveFulltextIndex') AS int) AS index_actief
    `.execute(db);
    const r = rows[0];
    assert.ok(r, "geen antwoord");
    hoofdversie = r.hoofdversie;
    console.log(`    SQL Server ${r.versie} (${r.editie}); IsFullTextInstalled = ${r.fts}; 1043 = ${r.nederlands ?? "(geen)"}`);
    fulltext = r.fts === 1 && r.nederlands !== null;
    if (fulltextVerwacht !== undefined) {
      assert.equal(fulltext, fulltextVerwacht === "1", "MSSQL_TEST_FULLTEXT_VERWACHT");
    }
    if (fulltext) {
      assert.equal(r.nederlands, "Dutch");
      assert.equal(r.index_actief, 1, "0005_fulltext had een actieve index moeten maken");
      if (beheerder) {
        // De woordsplitser voor Nederlands (alleen naam, versie en fabrikant).
        try {
          const { rows: onderdelen } = await sql<Record<string, unknown>>`
            EXEC sys.sp_help_fulltext_system_components 'wordbreaker'
          `.execute(beheerder);
          // Kolommen verschillen per versie; het pad (fullpath) tonen we niet.
          const nl = onderdelen.filter((o) =>
            Object.entries(o).some(([k, v]) => k !== "fullpath" && /^(1043|dutch|nederlands)$/i.test(String(v).trim()))
          );
          for (const o of nl) {
            const { fullpath: _pad, ...rest } = o;
            void _pad;
            console.log(`    woordsplitser: ${JSON.stringify(rest)}`);
          }
          if (!nl.length) {
            console.log(
              `    woordsplitser voor 1043 niet herkend in ${onderdelen.length} onderdelen; kolommen: ${Object.keys(onderdelen[0] ?? {}).join(", ")}`
            );
          }
        } catch (err) {
          console.log(`    sp_help_fulltext_system_components: fout ${foutNummers(err).join("+") || "?"}`);
        }
      }
    }
  });

  if (!fulltext) {
    await stap("FT-11 zonder Full-Text Search: geen index, 0005_fulltext niet vastgelegd", async () => {
      const { rows } = await sql<{ index_actief: number | null; vastgelegd: number }>`
        SELECT CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableHasActiveFulltextIndex') AS int) AS index_actief,
               (SELECT COUNT(*) FROM dbo.kb_migrations WHERE "naam" = N'0005_fulltext') AS vastgelegd
      `.execute(db);
      assert.notEqual(rows[0]?.index_actief, 1);
      assert.equal(rows[0]?.vastgelegd, 0);
      const { rows: catalogi } = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM sys.fulltext_catalogs`.execute(db);
      assert.equal(catalogi[0]?.n, 0);
    });
    for (const ft of ["FT-2", "FT-3", "FT-4", "FT-7", "FT-10", "FT-8"]) {
      await stap(`${ft} (vraagt Full-Text Search)`, async () => "overgeslagen");
    }
  } else {
    const parserNodig = async (): Promise<Db | "overgeslagen"> => {
      if (beheerder) return beheerder;
      if (fulltextVerwacht === "1") {
        throw new Error("sys.dm_fts_parser vraagt sysadmin: zet MSSQL_TEST_BEHEERDER_USER en MSSQL_TEST_BEHEERDER_PASSWORD");
      }
      return "overgeslagen";
    };

    await stap("FT-2 Nederlandse stemmer (FORMSOF INFLECTIONAL)", async () => {
      const b = await parserNodig();
      if (b === "overgeslagen") return b;
      const vormen: Record<string, string[]> = {};
      for (const w of ["lopen", "artikelen", "artikel", "rood", "printer", "installeren", "kennisbank", "beeldvorming"]) {
        const rijen = await parser(b, `FORMSOF(INFLECTIONAL, "${w}")`);
        vormen[w] = [...new Set(rijen.map((x) => x.display_term))];
        console.log(`    ${w.padEnd(13)} ${String(vormen[w].length).padStart(3)} vormen: ${vormen[w].join(", ")}`);
      }
      const werkt = vormen.lopen.length > 1 && vormen.rood.length > 1;
      console.log(
        `    stemmer (SQL Server ${hoofdversie}): ${werkt ? "werkt (lopen en rood hebben vervoegingen)" : "GEEN vervoegingen voor lopen/rood"}`
      );
      // Elk woord geeft minstens zichzelf terug.
      for (const [w, v] of Object.entries(vormen)) assert.ok(v.includes(w), `${w} ontbreekt in zijn eigen vormen`);
      if (stemmerVerwacht === "0") {
        console.log("    vervoegingen niet geëist (MSSQL_TEST_STEMMER_VERWACHT=0)");
        return;
      }
      assert.ok(werkt, "de stemmer geeft geen vervoegingen (zet MSSQL_TEST_STEMMER_VERWACHT=0 als dat zo hoort)");
      // De app rekent op artikel ↔ artikelen (FT-9 in db:test:mssql).
      assert.ok(vormen.artikelen.includes("artikel"), "artikelen → artikel ontbreekt");
      assert.ok(vormen.artikel.includes("artikelen"), "artikel → artikelen ontbreekt");
    });

    await stap("FT-3 woordsplitsing zonder stoplijst", async () => {
      const b = await parserNodig();
      if (b === "overgeslagen") return b;
      const termen = ["c#", "c++", "node.js", "e-mail", "kat_hond", "o'brien", "printerinstellingen", "één", "café", "2026-10-19", "100%", "de"];
      for (const t of termen) {
        const rijen = await parser(b, `"${t}"`);
        console.log(
          `    ${t.padEnd(20)} → ${rijen.map((x) => `${x.display_term}${/exact match/i.test(x.special_term) ? "" : ` (${x.special_term})`}`).join(" | ") || "(geen tokens)"}`
        );
        // Een term van alleen letters zonder tokens zou CONTAINS leeg maken (7645): de parser moet hem laten vallen.
        if (rijen.length === 0 && /^[\p{L}\p{M}]+$/u.test(t)) {
          assert.equal(naarContains(parseZoekvraag(t)), null, `${t} geeft geen tokens maar blijft in de voorwaarde`);
        }
      }
      // Zonder stoplijst is "de" gewoon een token: daarom verwijdert de app zelf de stopwoorden.
      assert.equal((await parser(b, '"de"')).length, 1);
    });

    await stap("FT-4 grammatica: elke voorwaarde van de parser is geldige CONTAINS-syntax", async () => {
      const b = await parserNodig();
      if (b === "overgeslagen") return b;
      const invoer = [...VASTE_VRAGEN, ...willekeurigeInvoer(5000)];
      const voorwaarden = new Set<string>();
      for (const q of invoer) {
        const groepen = parseZoekvraag(q);
        // Ook met het stamprefix, zoals de app op SQL Server 2016–2022 zoekt.
        for (const opties of [{}, { stamPrefix: true }]) {
          for (const v of [naarContains(groepen, opties), naarBonus(groepen, opties)]) {
            if (v) {
              assert.ok(v.length < 4000, `voorwaarde van ${v.length} tekens`);
              voorwaarden.add(v);
            }
          }
        }
      }
      const lijst = [...voorwaarden];
      const fouten: string[] = [];
      // Vier verbindingen naast elkaar (elk een eigen sessie uit de pool).
      let volgende = 0;
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (volgende < lijst.length) {
            const v = lijst[volgende++];
            try {
              await parser(b, v);
            } catch (err) {
              fouten.push(`${foutNummers(err).join("+") || "?"}: ${JSON.stringify(v).slice(0, 200)}`);
            }
          }
        })
      );
      console.log(`    ${invoer.length} invoeren → ${lijst.length} verschillende voorwaarden, ${fouten.length} fout(en)`);
      assert.deepEqual(fouten.slice(0, 10), []);
    });

    await stap("FT-7 AND over kolommen: alleen search_text vindt woorden in verschillende kolommen", async () => {
      await maakAuteur();
      const inTitel = uniekWoord();
      const inExcerpt = uniekWoord();
      const id = await maakArtikel(`over ${inTitel}`, `samen ${inExcerpt}`, "inhoud zonder de twee woorden");
      await wachtOpZoekindex(db);
      const voorwaarde = `"${inTitel}" AND "${inExcerpt}"`;
      const { rows: perKolom } = await sql<{ id: string }>`
        SELECT "id" FROM dbo.articles WHERE CONTAINS(("title", "excerpt"), ${voorwaarde}, LANGUAGE 1043)
      `.execute(db);
      assert.deepEqual(perKolom, [], "CONTAINS over (title, excerpt) zou elk woord in DEZELFDE kolom vragen");
      const { rows: samen } = await sql<{ id: string }>`
        SELECT a."id" FROM CONTAINSTABLE(dbo.articles, search_text, ${voorwaarde}, LANGUAGE 1043) AS ct
        JOIN dbo.articles AS a ON a."id" = ct.[KEY]
      `.execute(db);
      assert.deepEqual(samen.map((r) => r.id), [id]);
    });

    await stap('FT-10 stamprefix: artikel ↔ artikelen met "artikel*" (zo zoekt de app op 2016–2022)', async () => {
      await maakAuteur();
      const merk = uniekWoord();
      const enkelvoud = await maakArtikel("stamprefix enkelvoud", null, `${merk} dit artikel gaat over iets`);
      const meervoud = await maakArtikel("stamprefix meervoud", null, `${merk} alle artikelen samen`);
      const beide = [enkelvoud, meervoud].sort();
      const gevonden = async (q: string, stamPrefix: boolean) => {
        const voorwaarde = naarContains(parseZoekvraag(q), { stamPrefix });
        assert.ok(voorwaarde);
        const { rows } = await sql<{ id: string }>`
          SELECT a."id" FROM CONTAINSTABLE(dbo.articles, search_text, ${voorwaarde}, LANGUAGE 1043) AS ct
          JOIN dbo.articles AS a ON a."id" = ct.[KEY]
        `.execute(db);
        return rows.map((r) => r.id).sort();
      };
      // Wachten tot de index de twee artikels kent.
      const start = performance.now();
      while ((await gevonden(merk, false)).length !== 2) {
        if (performance.now() - start > 120_000) throw new Error("na 120 s nog niet vindbaar");
        await wacht(100);
      }
      const prefix = naarContains(parseZoekvraag(`${merk} artikelen`), { stamPrefix: true }) ?? "";
      assert.ok(prefix.includes('"artikel*"'), prefix);
      assert.deepEqual(await gevonden(`${merk} artikelen`, true), beide, "artikelen met stamprefix");
      assert.deepEqual(await gevonden(`${merk} artikel`, true), beide, "artikel met stamprefix");

      // Alleen FORMSOF: wat de stemmer van DEZE server doet.
      const meervoudVindt = await gevonden(`${merk} artikelen`, false);
      const enkelvoudVindt = await gevonden(`${merk} artikel`, false);
      const vindt = (r: string[], id: string) => (r.includes(id) ? "ook" : "NIET");
      console.log(
        `    SQL Server ${hoofdversie}, alleen FORMSOF: "artikelen" vindt ${vindt(meervoudVindt, enkelvoud)} "artikel", ` +
          `"artikel" vindt ${vindt(enkelvoudVindt, meervoud)} "artikelen"; de app gebruikt hier ` +
          `${heeftOudeStemmer(hoofdversie) ? "ook het stamprefix" : "alleen FORMSOF"}`
      );
      if (stemmerVerwacht === "1") {
        assert.deepEqual(meervoudVindt, beide, "FORMSOF(artikelen) vindt artikel niet");
        assert.deepEqual(enkelvoudVindt, beide, "FORMSOF(artikel) vindt artikelen niet");
      }
      // Geeft de stemmer van deze server zelf geen vervoegingen, dan moet de app het stamprefix gebruiken.
      if (!meervoudVindt.includes(enkelvoud)) {
        assert.ok(heeftOudeStemmer(hoofdversie), `SQL Server ${hoofdversie} geeft geen vervoegingen, maar de app gebruikt geen stamprefix`);
      }
    });

    await stap(`FT-8 change tracking: ${METINGEN} keer INSERT tot vindbaar, daarna een UPDATE van content_text`, async () => {
      await maakAuteur();
      await wachtOpZoekindex(db);
      const duur: number[] = [];
      let laatsteId = "";
      let laatsteWoord = "";
      for (let i = 0; i < METINGEN; i++) {
        const woord = uniekWoord();
        laatsteId = await maakArtikel(`meting ${i}`, null, `meting ${woord}`);
        laatsteWoord = woord;
        const start = performance.now();
        while ((await aantalGevonden(`"${woord}"`)) !== 1) {
          if (performance.now() - start > 120_000) throw new Error(`meting ${i}: na 120 s nog niet vindbaar`);
          await wacht(25);
        }
        duur.push(performance.now() - start);
      }
      const gesorteerd = [...duur].sort((a, b) => a - b);
      const gemiddeld = duur.reduce((a, b) => a + b, 0) / duur.length;
      const p = (q: number) => gesorteerd[Math.min(gesorteerd.length - 1, Math.floor(q * gesorteerd.length))];
      console.log(
        `    INSERT → vindbaar: gemiddeld ${Math.round(gemiddeld)} ms, mediaan ${Math.round(p(0.5))} ms, ` +
          `p95 ${Math.round(p(0.95))} ms, max ${Math.round(gesorteerd[gesorteerd.length - 1])} ms (n = ${duur.length})`
      );

      // Alleen content_text wijzigen: het nieuwe woord vindbaar, het oude niet meer.
      const nieuw = uniekWoord();
      await sql`UPDATE dbo.articles SET "content_text" = ${`bijgewerkt ${nieuw}`}, "updated_at" = SYSUTCDATETIME() WHERE "id" = ${laatsteId}`.execute(db);
      const start = performance.now();
      for (;;) {
        const [n, o] = [await aantalGevonden(`"${nieuw}"`), await aantalGevonden(`"${laatsteWoord}"`)];
        if (n === 1 && o === 0) break;
        if (performance.now() - start > 120_000) throw new Error(`UPDATE: na 120 s nieuw=${n}, oud=${o}`);
        await wacht(25);
      }
      console.log(`    UPDATE content_text → nieuw woord vindbaar, oud weg: ${Math.round(performance.now() - start)} ms`);

      // In rust: niets meer te verwerken.
      await wachtOpZoekindex(db);
      const { rows } = await sql<{ wachtend: number; vulstatus: number }>`
        SELECT CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableFulltextPendingChanges') AS int) AS wachtend,
               CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableFulltextPopulateStatus') AS int) AS vulstatus
      `.execute(db);
      assert.deepEqual(rows[0], { wachtend: 0, vulstatus: 0 });
    });
  }

  console.log(`\nAlle ${geslaagd} stappen geslaagd${overgeslagen ? `, ${overgeslagen} overgeslagen` : ""}.`);
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
  try {
    await opruimen();
  } catch (err) {
    console.error("Opruimen mislukt:", foutNummers(err).join(", ") || (err as Error)?.message);
    process.exitCode = 1;
  }
  await Promise.all(instanties.map((d) => d.destroy()));
}
