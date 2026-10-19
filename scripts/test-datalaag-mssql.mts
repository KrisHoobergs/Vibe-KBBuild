/**
 * Test van de datalaag op SQL Server, tegen een SQL Server-TESTdatabase
 * (MSSQL_TEST_* in .env.local of de omgeving).
 *
 *   npm run db:test:mssql
 *
 * Eerst dezelfde stappen als npm run db:test (scripts/lib/datalaag-stappen.mts),
 * daarna wat alleen op SQL Server kan misgaan: datetime2-precisie, Unicode,
 * foutnummers (547, 2627/2601, 8134, 1205), NOCOUNT, bestanden in de database
 * (20 MB, bereik), updated_at zonder trigger, gelijktijdige inserts en het
 * zoeken (full-text of LIKE, naargelang de server).
 *
 * Weigert elke database die niet kb_test…/kennisbank_test… heet of de
 * markering kb_testdatabase mist (scripts/lib/mssql-testomgeving.mts). Voert
 * eerst de ontbrekende migraties uit. Alles wat de test aanmaakt, ruimt hij op.
 *
 * Optioneel MSSQL_TEST_FULLTEXT_VERWACHT=1 of 0: controleert dat de zoekfunctie
 * wel of geen full-text-index heeft (CI-varianten).
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { sql, type Kysely } from "kysely";
import { assertMssqlTestdatabase, wachtOpZoekindex, zetMssqlTestomgeving } from "./lib/mssql-testomgeving.mjs";

zetMssqlTestomgeving();
const fulltextVerwacht = process.env.MSSQL_TEST_FULLTEXT_VERWACHT;

const { leesConfig } = await import("../src/lib/config");
const { maakKysely } = await import("../src/lib/db/connection");
const { foutNummers, isMssqlDeadlock, isUniqueViolation } = await import("../src/lib/db/dialect");
const { voerMigratiesUit } = await import("../src/lib/db/auto-migrate");
const { maakDatalaagTest, wachtTot } = await import("./lib/datalaag-stappen.mjs");
const artikelen = await import("../src/lib/db/repositories/articles");
const tags = await import("../src/lib/db/repositories/tags");
const herstel = await import("../src/lib/db/repositories/password-resets");
const zoeken = await import("../src/lib/db/repositories/search");
const { databaseStorage } = await import("../src/lib/storage/database");

const config = leesConfig();
if (config.db.dialect !== "mssql") throw new Error("De testomgeving zette DB_DIALECT=mssql niet");
const mssqlConfig = config.db;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>;
const instanties: Db[] = [];
/** Een eigen Kysely-instantie (eigen pool, dus eigen sessies), naast getDb(). */
function nieuweDb(poolMax = 1): Db {
  const { db } = maakKysely({ ...mssqlConfig, poolMax }, { requestTimeoutMs: 120_000 });
  instanties.push(db);
  return db;
}
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
/** Een woord van alleen letters dat nergens anders voorkomt (zoeken). */
const uniekWoord = () => `qz${Array.from(randomBytes(8), (b) => "abcdefghijklmnopqrstuvwxyz"[b % 26]).join("")}`;

const test = maakDatalaagTest({
  heeftAuthUsers: true,
  wachtOpZoekindex: () => wachtOpZoekindex(test.db),
  toonDuur: true,
});
const { db, PREFIX, auteurId, tweedeId, stap } = test;

const BESTAND = { bucket: "articles" as const, pad: `articles/${PREFIX}/groot.mp4` };

async function extraOpruimen() {
  await db.deleteFrom("files").where("bucket", "=", BESTAND.bucket).where("path", "=", BESTAND.pad).execute();
  await db.deleteFrom("password_resets").where("user_id", "in", [auteurId, tweedeId]).execute();
}

/** Maakt een gepubliceerd testartikel (titel met PREFIX, dus mee opgeruimd). */
async function artikel(
  titel: string,
  inhoud: string,
  extra: { excerpt?: string | null; tagIds?: string[]; status?: "draft" | "published" } = {}
) {
  const a = await artikelen.insertArticle(
    {
      title: `${PREFIX} ${titel}`,
      excerpt: extra.excerpt ?? null,
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: inhoud }] }] },
      content_text: inhoud,
      cover_image_url: null,
      tag_ids: extra.tagIds ?? [],
    },
    auteurId
  );
  if ((extra.status ?? "published") === "published") await artikelen.setArticleStatus(a.id, "published", tweedeId);
  return a;
}

try {
  await stap("testdatabase gecontroleerd (naam en markering), migraties bijgewerkt", async () => {
    await assertMssqlTestdatabase(db);
    const uitgevoerd = await voerMigratiesUit(() => {});
    if (uitgevoerd.length) console.log(`    migraties uitgevoerd: ${uitgevoerd.join(", ")}`);
  });

  // ------------------------------------------------ dezelfde stappen als db:test
  await test.gedeeldeStappen();

  // ------------------------------------------------ alleen SQL Server
  await stap("NOCOUNT staat uit (anders kloppen de rijtellingen van UPDATE niet)", async () => {
    const { rows } = await sql<{ nocount: number }>`SELECT CAST(@@OPTIONS & 512 AS int) AS nocount`.execute(db);
    assert.equal(rows[0]?.nocount, 0);
  });

  await stap("datetime2: …05.678Z blijft tot op de milliseconde gelijk", async () => {
    const a = await artikel("Tijdstip", "tijdstip", { status: "draft" });
    const tijd = new Date("2026-01-02T03:04:05.678Z");
    await db.updateTable("articles").set({ updated_at: tijd }).where("id", "=", a.id).execute();
    const { rows } = await sql<{ tekst: string }>`
      SELECT CONVERT(varchar(23), "updated_at", 126) AS tekst FROM dbo.articles WHERE "id" = ${a.id}
    `.execute(db);
    assert.equal(rows[0]?.tekst, "2026-01-02T03:04:05.678");
    assert.equal((await artikelen.getArticleWithRelations(a.slug))?.updated_at, "2026-01-02T03:04:05.678Z");
  });

  await stap("Unicode in titel, excerpt, content_text en content", async () => {
    const tekst = "Œuvre – ‘test’ ĳ Ł ß 🎉";
    const a = await artikelen.insertArticle(
      {
        title: `${PREFIX} ${tekst}`,
        excerpt: tekst,
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: tekst }] }] },
        content_text: tekst,
        cover_image_url: null,
        tag_ids: [],
      },
      auteurId
    );
    const terug = await artikelen.getArticleWithRelations(a.slug);
    assert.equal(terug?.title, `${PREFIX} ${tekst}`);
    assert.equal(terug?.excerpt, tekst);
    assert.equal(terug?.content_text, tekst);
    assert.deepEqual(terug?.content, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: tekst }] }] });
  });

  await stap("onbekende auteur: fout 547 (foreign key), niets blijft achter", async () => {
    const titel = `${PREFIX} Zonder auteur`;
    await assert.rejects(
      artikelen.insertArticle(
        { title: titel, excerpt: null, content: {}, content_text: "", cover_image_url: null, tag_ids: [] },
        randomUUID()
      ),
      (err: unknown) => {
        assert.ok(foutNummers(err).includes(547), `foutnummers: ${foutNummers(err).join(", ")}`);
        return true;
      }
    );
    const { rows } = await sql<{ aantal: number }>`
      SELECT COUNT(*) AS aantal FROM dbo.articles WHERE "title" = ${titel}
    `.execute(db);
    assert.equal(rows[0]?.aantal, 0);
  });

  await stap("dubbele tag: isUniqueViolation (2627/2601)", async () => {
    const rij = { id: randomUUID(), name: `${PREFIX} Dubbel`, slug: `${PREFIX}-dubbel`, created_at: new Date() };
    await db.insertInto("tags").values(rij).execute();
    let fout: unknown;
    try {
      await db.insertInto("tags").values({ ...rij, id: randomUUID() }).execute();
    } catch (err) {
      fout = err;
    }
    assert.ok(fout, "tweede insert had moeten mislukken");
    assert.ok(isUniqueViolation(fout));
    assert.ok(foutNummers(fout).some((n) => n === 2627 || n === 2601), `foutnummers: ${foutNummers(fout).join(", ")}`);
    console.log(`    foutnummers ${foutNummers(fout).join(" + ")}${Array.isArray(fout) ? " (als array)" : " (één fout)"}`);
  });

  await stap("pinnen en herordenen zetten updated_at (geen trigger op SQL Server)", async () => {
    const a = await artikel("Pin tijd", "pin", { status: "draft" });
    const tijd = async () =>
      (await db.selectFrom("articles").select("updated_at").where("id", "=", a.id).executeTakeFirstOrThrow()).updated_at.getTime();
    let vorige = await tijd();
    await wacht(20);
    assert.equal(await artikelen.togglePin(a.id), true);
    assert.ok((await tijd()) > vorige, "togglePin (aan)");
    vorige = await tijd();
    await wacht(20);
    await artikelen.reorderPinned([a.id]);
    assert.ok((await tijd()) > vorige, "reorderPinned");
    vorige = await tijd();
    await wacht(20);
    assert.equal(await artikelen.togglePin(a.id), true);
    assert.ok((await tijd()) > vorige, "togglePin (uit)");
  });

  await stap("herstellink: rijtellingen kloppen (markPasswordResetUsed true, daarna false)", async () => {
    const { token } = await herstel.insertPasswordReset(auteurId, tweedeId);
    assert.deepEqual(await herstel.getValidPasswordReset(token), { userId: auteurId, email: `${PREFIX}-auteur@voorbeeld.be` });
    assert.equal(await herstel.markPasswordResetUsed(token), true);
    assert.equal(await herstel.markPasswordResetUsed(token), false);
    assert.equal(await herstel.getValidPasswordReset(token), null);
    // Een nieuwe link laat de vorige (open) vervallen.
    const eerste = await herstel.insertPasswordReset(auteurId, tweedeId);
    const tweede = await herstel.insertPasswordReset(auteurId, tweedeId);
    assert.equal(await herstel.getValidPasswordReset(eerste.token), null);
    assert.equal((await herstel.getValidPasswordReset(tweede.token))?.userId, auteurId);
  });

  await stap("transactie met XACT_ABORT: de echte fout 8134, niet 3903", async () => {
    // Eigen instantie: SET XACT_ABORT ON blijft op die sessie staan.
    const eigen = nieuweDb();
    await assert.rejects(
      eigen.transaction().execute(async (trx) => {
        await sql`SET XACT_ABORT ON; SELECT 1 / 0 AS nul`.execute(trx);
      }),
      (err: unknown) => {
        assert.ok(foutNummers(err).includes(8134), `foutnummers: ${foutNummers(err).join(", ")}`);
        assert.ok(!foutNummers(err).includes(3903));
        return true;
      }
    );
    const { rows } = await sql<{ open: number }>`SELECT @@TRANCOUNT AS [open]`.execute(eigen);
    assert.equal(rows[0]?.open, 0);
  });

  await stap("deadlock: het slachtoffer krijgt 1205 (niet 3903), geen open transactie", async () => {
    const x = await artikel("Deadlock x", "x", { status: "draft" });
    const y = await artikel("Deadlock y", "y", { status: "draft" });
    const a = nieuweDb();
    const b = nieuweDb();
    const kruislings = (eigen: Db, eerst: string, dan: string) =>
      eigen.transaction().execute(async (trx) => {
        await trx.updateTable("articles").set({ updated_at: new Date() }).where("id", "=", eerst).execute();
        await wacht(500);
        await trx.updateTable("articles").set({ updated_at: new Date() }).where("id", "=", dan).execute();
      });
    const uitkomst = await Promise.allSettled([kruislings(a, x.id, y.id), kruislings(b, y.id, x.id)]);
    const mislukt = uitkomst.flatMap((u, i) => (u.status === "rejected" ? [{ i, fout: u.reason as unknown }] : []));
    assert.equal(mislukt.length, 1, `verwacht precies één slachtoffer, kreeg ${mislukt.length}`);
    assert.ok(isMssqlDeadlock(mislukt[0].fout), `foutnummers: ${foutNummers(mislukt[0].fout).join(", ")}`);
    assert.ok(!foutNummers(mislukt[0].fout).includes(3903));
    const slachtoffer = mislukt[0].i === 0 ? a : b;
    const { rows } = await sql<{ open: number }>`SELECT @@TRANCOUNT AS [open]`.execute(slachtoffer);
    assert.equal(rows[0]?.open, 0);
  });

  await stap("bestanden in de database: 20 MB schrijven, volledig en bereik lezen (sha256), dubbel geweigerd", async () => {
    const data = randomBytes(20 * 1024 * 1024);
    const start = performance.now();
    await databaseStorage.put!(BESTAND.bucket, BESTAND.pad, data, "video/mp4", auteurId);
    const schrijven = performance.now() - start;
    const vol = await databaseStorage.get(BESTAND.bucket, BESTAND.pad);
    assert.equal(vol?.grootte, data.length);
    assert.equal(vol?.contentType, "video/mp4");
    assert.equal(sha256(vol!.data), sha256(data));
    const deel = await databaseStorage.get(BESTAND.bucket, BESTAND.pad, { start: 1_000_000, einde: 2_000_000 });
    assert.deepEqual(deel?.bereik, { start: 1_000_000, einde: 2_000_000 });
    assert.equal(deel?.data.length, 1_000_001);
    assert.equal(sha256(deel!.data), sha256(data.subarray(1_000_000, 2_000_001)));
    // "bytes=0-": hooguit 4 MiB per antwoord; het laatste stuk tot het einde.
    const begin = await databaseStorage.get(BESTAND.bucket, BESTAND.pad, { start: 0 });
    assert.deepEqual(begin?.bereik, { start: 0, einde: 4 * 1024 * 1024 - 1 });
    assert.equal(sha256(begin!.data), sha256(data.subarray(0, 4 * 1024 * 1024)));
    const staart = await databaseStorage.get(BESTAND.bucket, BESTAND.pad, { start: data.length - 10 });
    assert.equal(sha256(staart!.data), sha256(data.subarray(data.length - 10)));
    const voorbij = await databaseStorage.get(BESTAND.bucket, BESTAND.pad, { start: data.length + 5 });
    assert.equal(voorbij?.data.length, 0);
    await assert.rejects(databaseStorage.put!(BESTAND.bucket, BESTAND.pad, Buffer.from("anders"), "video/mp4", auteurId), (err: unknown) => {
      assert.ok(isUniqueViolation(err), `foutnummers: ${foutNummers(err).join(", ")}`);
      return true;
    });
    assert.equal(sha256((await databaseStorage.get(BESTAND.bucket, BESTAND.pad))!.data), sha256(data));
    console.log(`    20 MB schrijven: ${(schrijven / 1000).toFixed(1)} s`);
  });

  await stap("gelijktijdig aanmaken: 20 keer 10 tegelijk met dezelfde titel, allemaal unieke slugs", async () => {
    const fouten: string[] = [];
    for (let ronde = 0; ronde < 20; ronde++) {
      const uitkomst = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          artikelen.insertArticle(
            { title: `${PREFIX} Drukte ${ronde}`, excerpt: null, content: {}, content_text: "", cover_image_url: null, tag_ids: [] },
            auteurId
          )
        )
      );
      const gelukt = uitkomst.flatMap((u) => (u.status === "fulfilled" ? [u.value.slug] : []));
      for (const u of uitkomst) {
        if (u.status === "rejected") fouten.push(`ronde ${ronde}: ${foutNummers(u.reason).join("+") || String(u.reason)}`);
      }
      assert.equal(new Set(gelukt).size, gelukt.length, `dubbele slug in ronde ${ronde}`);
    }
    assert.deepEqual(fouten, []);
  });

  // ------------------------------------------------ zoeken (FT-9 / FT-11)
  let fulltext = false;
  await stap("zoeken: full-text-index of LIKE bepaald", async () => {
    const { rows } = await sql<{ actief: number | null }>`
      SELECT CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableHasActiveFulltextIndex') AS int) AS actief
    `.execute(db);
    fulltext = rows[0]?.actief === 1;
    console.log(`    zoeken via ${fulltext ? "full-text" : "LIKE (geen full-text-index)"}`);
    if (fulltextVerwacht !== undefined) assert.equal(fulltext, fulltextVerwacht === "1", "MSSQL_TEST_FULLTEXT_VERWACHT");
  });

  const corpus: Record<string, { id: string; slug: string }> = {};
  const merk = uniekWoord();
  const reeks = uniekWoord();
  const ALLE = ["draft", "in_review", "published"];
  const zoek = (query: string, extra: { tagSlugs?: string[] | null; statuses?: string[]; limit?: number; offset?: number } = {}) =>
    zoeken.searchArticlesInDb({ query, tagSlugs: null, statuses: ALLE, limit: 50, offset: 0, ...extra });
  const ids = (r: { id: string }[]) => r.map((x) => x.id);
  const bevat = (r: { id: string }[], ...namen: string[]) => {
    for (const n of namen) assert.ok(ids(r).includes(corpus[n].id), `${n} ontbreekt`);
  };
  const bevatNiet = (r: { id: string }[], ...namen: string[]) => {
    for (const n of namen) assert.ok(!ids(r).includes(corpus[n].id), `${n} hoort er niet bij`);
  };

  await stap("zoekcorpus aanmaken (42 artikels) en wachten op de zoekindex", async () => {
    const t1 = await tags.insertTag(`${PREFIX} Zoek een`, `${PREFIX}-zoek-een`);
    const t2 = await tags.insertTag(`${PREFIX} Zoek twee`, `${PREFIX}-zoek-twee`);
    assert.ok(t1.ok && t2.ok);
    const teksten: [string, string, string, Parameters<typeof artikel>[2]?][] = [
      ["enkelvoud", "Enkelvoud", `${merk} dit artikel gaat over iets`],
      ["meervoud", "Meervoud", `${merk} alle artikelen samen`],
      ["zin", "Zin", `${merk} hier staat een exacte zin in de tekst`],
      ["zinLos", "Zin los", `${merk} de zin is niet exacte dezelfde`],
      ["printer", "Printer", `${merk} de printer werkt`],
      ["printerUit", "Printer uit", `${merk} printer uitsluiten graag`],
      ["kat", "Kat", `${merk} er is een kat`],
      ["hond", "Hond", `${merk} er is een hond`],
      ["vis", "Vis", `${merk} er is een vis`],
      ["csharp", "Csharp", `${merk} programmeren in c# en .net`],
      ["node", "Node", `${merk} werken met node.js`],
      ["cafe", "Cafe", `${merk} het café om de hoek`],
      ["titel", "Handleiding voor iedereen", `${merk} tekst over iets anders`],
      ["inhoud", "Iets anders", `${merk} lees eerst de handleiding`],
      ["tag12", "Tag twee", `${merk} getagd met twee`, { tagIds: [t1.ok ? t1.tag.id : "", t2.ok ? t2.tag.id : ""] }],
      ["tag1", "Tag een", `${merk} getagd met een`, { tagIds: [t1.ok ? t1.tag.id : ""] }],
      ["concept", "Concept", `${merk} conceptversie`, { status: "draft" }],
    ];
    for (const [naam, titel, inhoud, extra] of teksten) corpus[naam] = await artikel(titel, inhoud, extra);
    for (let i = 0; i < 25; i++) corpus[`reeks${i}`] = await artikel(`Reeks ${i}`, `${reeks} nummer ${i}`);
    const ms = await wachtOpZoekindex(db);
    if (fulltext) console.log(`    zoekindex bij na ${ms} ms`);
    // Ook de zoekfunctie zelf moet ze al vinden.
    const alle = await wachtTot(() => zoek(merk), (r) => r.length >= 17);
    assert.equal(alle.length, 17, "alle gepubliceerde en concept-artikels met het merkwoord");
  });

  await stap("zoeken: vervoegingen (artikel ↔ artikelen), accenten (cafe → café, één → een)", async () => {
    bevat(await zoek(`${merk} artikelen`), "enkelvoud", "meervoud");
    bevat(await zoek(`${merk} artikel`), "enkelvoud", "meervoud");
    bevat(await zoek(`${merk} cafe`), "cafe");
    bevat(await zoek(`${merk} één`), "kat", "hond", "vis");
  });

  await stap('zoeken: "exacte zin", uitsluiten met -, or', async () => {
    const zin = await zoek(`${merk} "exacte zin"`);
    bevat(zin, "zin");
    bevatNiet(zin, "zinLos");
    const uit = await zoek(`${merk} printer -uitsluiten`);
    bevat(uit, "printer");
    bevatNiet(uit, "printerUit");
    const of = await zoek(`${merk} kat or ${merk} hond`);
    bevat(of, "kat", "hond");
    bevatNiet(of, "vis");
    assert.deepEqual(await zoek(`-${merk}`), [], "alleen uitsluitingen: niets");
  });

  await stap("zoeken: c#, node.js, rare invoer", async () => {
    const c = await zoek(`${merk} c#`);
    bevat(c, "csharp");
    if (!fulltext) assert.deepEqual(ids(c), [corpus.csharp.id]);
    bevat(await zoek(`${merk} node.js`), "node");
    assert.deepEqual(await zoek(`${merk} '); DROP TABLE articles; --`), []);
    assert.deepEqual(await zoek(`${merk} ${"x".repeat(5000)}`), []);
    assert.equal((await zoek(`${merk} [%_!]`)).length, 17, "[%_!] valt weg");
  });

  await stap("zoeken: titel weegt zwaarder dan inhoud; tags als JSON (null zonder tags)", async () => {
    const r = await zoek(`${merk} handleiding`);
    assert.deepEqual(ids(r), [corpus.titel.id, corpus.inhoud.id]);
    assert.ok(r[0].rank > r[1].rank, `${r[0].rank} > ${r[1].rank}`);
    for (const x of r) {
      assert.equal(typeof x.rank, "number");
      assert.ok(Number.isFinite(x.rank));
      assert.match(x.updated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      assert.match(x.published_at ?? "", /^\d{4}-\d\d-\d\dT/);
      assert.equal(x.tags, null);
      assert.equal(x.author_name, `${PREFIX} Nieuwe naam`);
      assert.equal(x.status, "published");
    }
    const [getagd] = await zoek(`${merk} getagd twee`);
    assert.equal(getagd.id, corpus.tag12.id);
    assert.deepEqual(
      [...(getagd.tags ?? [])].sort((a, b) => a.slug.localeCompare(b.slug)),
      [
        { name: `${PREFIX} Zoek een`, slug: `${PREFIX}-zoek-een` },
        { name: `${PREFIX} Zoek twee`, slug: `${PREFIX}-zoek-twee` },
      ]
    );
  });

  await stap("zoeken: twee tags (AND), alleen gepubliceerd", async () => {
    assert.deepEqual(ids(await zoek(`${merk} getagd`, { tagSlugs: [`${PREFIX}-zoek-een`, `${PREFIX}-zoek-twee`] })), [corpus.tag12.id]);
    assert.deepEqual(
      ids(await zoek(`${merk} getagd`, { tagSlugs: [`${PREFIX}-zoek-een`] })).sort(),
      [corpus.tag12.id, corpus.tag1.id].sort()
    );
    assert.deepEqual(await zoek(`${merk} getagd`, { tagSlugs: [`${PREFIX}-zoek-een`, "bestaat-niet"] }), []);
    assert.deepEqual(await zoek(`${merk} conceptversie`, { statuses: ["published"] }), []);
    assert.deepEqual(ids(await zoek(`${merk} conceptversie`)), [corpus.concept.id]);
    assert.deepEqual(await zoek(`${merk}`, { statuses: [] }), []);
  });

  await stap("zoeken: offset 20, limiet 0, negatieve offset, limiet 1000", async () => {
    const eerste = await zoek(reeks, { limit: 20, offset: 0 });
    const tweede = await zoek(reeks, { limit: 20, offset: 20 });
    assert.equal(eerste.length, 20);
    assert.equal(tweede.length, 5);
    const samen = new Set([...ids(eerste), ...ids(tweede)]);
    assert.equal(samen.size, 25);
    for (let i = 0; i < 25; i++) assert.ok(samen.has(corpus[`reeks${i}`].id));
    assert.deepEqual(ids(await zoek(reeks, { limit: 0 })), ids(eerste).slice(0, 1));
    assert.deepEqual(ids(await zoek(reeks, { limit: 20, offset: -5 })), ids(eerste));
    assert.equal((await zoek(reeks, { limit: 1000 })).length, 25);
    assert.deepEqual(await zoek(reeks, { offset: 1e12 }), []);
  });

  console.log(`\nAlle ${test.geslaagd} stappen geslaagd.`);
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
    await extraOpruimen();
    await test.opruimen();
  } catch (err) {
    console.error("Opruimen mislukt:", foutNummers(err).join(", ") || (err as Error)?.message);
    process.exitCode = 1;
  }
  await Promise.all(instanties.map((d) => d.destroy()));
  await db.destroy();
}
