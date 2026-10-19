// Zoeken op SQL Server (DB_DIALECT=mssql). Twee manieren:
//
// - Full-text (CONTAINSTABLE) als dbo.articles een actieve full-text-index
//   heeft (migratie 0005_fulltext, alleen met Full-Text Search op de server):
//   accentongevoelig, met Nederlandse vervoegingen vanaf SQL Server 2025. Op
//   2016–2022 geeft de stemmer geen woordvormen; daar zoekt elk woord ook op
//   het begin van zijn ruwe stam ("artikel*"), zie heeftOudeStemmer.
// - Anders een eenvoudige LIKE-zoekopdracht per woord, hoofdletter- en
//   accentongevoelig, met een ruwe stam (-en/-s). Ook na een full-text-fout.
//
// De zoekvraag gaat altijd als parameter mee, nooit in de SQL-tekst. Geen
// "server-only" en geen getDb() hier: de aanroeper (repositories/search.ts)
// geeft de database mee, zodat de unittests dit bestand zonder server laden.
import { sql, type Kysely, type RawBuilder } from "kysely";
import { foutNummers } from "@/lib/db/dialect";
import type { Database } from "@/lib/db/schema";
import {
  heeftOudeStemmer,
  naarBonus,
  naarContains,
  naarLike,
  parseZoekvraag,
  type ContainsOpties,
  type LikePlan,
} from "./mssql-query";
import type { ZoekParams, ZoekRij } from "./types";

type Db = Kysely<Database>;

/** Hoe lang de uitkomst van "is er een full-text-index?" (of "full-text even uit") geldt. */
const FULLTEXT_CONTROLE_MS = 5 * 60_000;
type FulltextStatus = { actief: boolean; opties: ContainsOpties; tot: number };
let fulltextStatus: FulltextStatus | undefined;

/** Vergeet de bewaarde full-text-status (voor tests). */
export function resetFulltextStatus(): void {
  fulltextStatus = undefined;
}

// Per proces 5 minuten bewaard: een index die later bijkomt (full-text achteraf
// geïnstalleerd, daarna db:migrate) wordt zo zonder herstart opgepikt. In
// dezelfde query de hoofdversie: op 2016–2022 krijgt elk woord een stamprefix.
// Mislukt de controle zelf, dan mislukt de zoekvraag (de database is dan
// onbereikbaar) en wordt er niets bewaard.
async function leesFulltextStatus(db: Db): Promise<FulltextStatus> {
  if (fulltextStatus && fulltextStatus.tot > Date.now()) return fulltextStatus;
  const { rows } = await sql<{ actief: number | null; hoofdversie: number | null }>`
    SELECT CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableHasActiveFulltextIndex') AS int) AS actief,
           CAST(SERVERPROPERTY('ProductMajorVersion') AS int) AS hoofdversie
  `.execute(db);
  fulltextStatus = {
    actief: rows[0]?.actief === 1,
    opties: { stamPrefix: heeftOudeStemmer(rows[0]?.hoofdversie) },
    tot: Date.now() + FULLTEXT_CONTROLE_MS,
  };
  return fulltextStatus;
}

// 7600–7699 en 30000–30099 zijn full-text-fouten, o.a. 7601 (geen index),
// 7609 (niet geïnstalleerd), 7630 (syntax), 7645 (lege voorwaarde), 30011
// (indexversie 1 op SQL Server 2025) en 30053 (time-out woordsplitser).
const isFulltextFout = (n: number) => (n >= 7600 && n <= 7699) || (n >= 30000 && n <= 30099);
// Fouten die bij één zoekvraag horen; bij alle andere is full-text even "uit".
const VRAAGFOUTEN = new Set([7630, 7645]);

/** De app vraagt er nooit meer; FETCH NEXT 0 (Msg 10744) en een negatieve OFFSET (Msg 10742) zijn fouten. */
const MAX_LIMIET = 50;
/** Zo blijft OFFSET een int-parameter. */
const MAX_OFFSET = 2_147_483_647;

function geheel(n: number, min: number, max: number, standaard: number): number {
  return Number.isFinite(n) ? Math.min(Math.max(min, Math.floor(n)), max) : standaard;
}

type Vraag = { statuses: string[]; tagSlugs: string[]; limit: number; offset: number };

const KOLOMMEN = sql`
      a.id, a.title, a.slug, a.excerpt, a.cover_image_url, a.status,
      p.display_name AS author_name, a.published_at, a.updated_at,
      (SELECT t.name, t.slug
         FROM dbo.article_tags AS at2
         JOIN dbo.tags AS t ON t.id = at2.tag_id
        WHERE at2.article_id = a.id
        FOR JSON PATH) AS tags`;

function filter(v: Vraag): RawBuilder<unknown> {
  const status = sql`a.status IN (${sql.join(v.statuses)})`;
  if (v.tagSlugs.length === 0) return status;
  // Een artikel moet ALLE gekozen tags hebben (AND), net als in listArticles.
  return sql`${status} AND a.id IN (
        SELECT at3.article_id
          FROM dbo.article_tags AS at3
          JOIN dbo.tags AS t2 ON t2.id = at3.tag_id
         WHERE t2.slug IN (${sql.join(v.tagSlugs)})
         GROUP BY at3.article_id
        HAVING COUNT(DISTINCT t2.slug) = ${v.tagSlugs.length})`;
}

/**
 * Full-text: filter en basisrang op search_text (titel + excerpt + inhoud),
 * plus een bonus voor treffers in de titel (×1) en het excerpt (×0,4), tegenover
 * ×0,2 voor de basis. Zoals de gewichten A/B/C in Postgres. CONTAINS met AND
 * over meerdere kolommen zou alle woorden in DEZELFDE kolom vragen; daarom de
 * samengevoegde kolom search_text.
 */
async function zoekMetFulltext(db: Db, v: Vraag, voorwaarde: string, bonus: string): Promise<ZoekRij[]> {
  const { rows } = await sql<ZoekRij>`
    SELECT ${KOLOMMEN},
           CAST(ct.[RANK] * 0.2 + ISNULL(ctt.[RANK], 0) + ISNULL(cte.[RANK], 0) * 0.4 AS float) / 1000 AS [rank]
      FROM CONTAINSTABLE(dbo.articles, search_text, ${voorwaarde}, LANGUAGE 1043) AS ct
      JOIN dbo.articles AS a ON a.id = ct.[KEY]
      JOIN dbo.profiles AS p ON p.id = a.author_id
      LEFT JOIN CONTAINSTABLE(dbo.articles, title, ${bonus}, LANGUAGE 1043) AS ctt ON ctt.[KEY] = a.id
      LEFT JOIN CONTAINSTABLE(dbo.articles, excerpt, ${bonus}, LANGUAGE 1043) AS cte ON cte.[KEY] = a.id
     WHERE ${filter(v)}
     ORDER BY [rank] DESC, a.updated_at DESC, a.id
    OFFSET ${v.offset} ROWS FETCH NEXT ${v.limit} ROWS ONLY
  `.execute(db);
  return rows;
}

// Hoofdletter- én accentongevoelig ("cafe" vindt "café"), ongeacht de
// collatie van de database.
const AI = sql.raw("COLLATE Latin1_General_100_CI_AI");

function like(kolom: "a.search_text" | "a.title" | "a.excerpt" | "a.content_text", patroon: string, niet = false) {
  return sql`${sql.raw(kolom)} ${AI} ${sql.raw(niet ? "NOT LIKE" : "LIKE")} ${patroon} ESCAPE '!'`;
}

/** Zonder full-text: LIKE per term (AND), met gewichten titel 1 / excerpt 0,4 / inhoud 0,2. */
async function zoekMetLike(db: Db, v: Vraag, plan: LikePlan): Promise<ZoekRij[]> {
  const groepen = plan.groepen.map(
    (g) =>
      sql`(${sql.join(
        [...g.verplicht.map((p) => like("a.search_text", p)), ...g.uitgesloten.map((p) => like("a.search_text", p, true))],
        sql` AND `
      )})`
  );
  const rang = sql.join(
    plan.rang.map(
      (p) => sql`CASE WHEN ${like("a.title", p)} THEN 1.0 ELSE 0 END
        + CASE WHEN ${like("a.excerpt", p)} THEN 0.4 ELSE 0 END
        + CASE WHEN ${like("a.content_text", p)} THEN 0.2 ELSE 0 END`
    ),
    sql` + `
  );
  const { rows } = await sql<ZoekRij>`
    SELECT ${KOLOMMEN}, CAST(${rang} AS float) AS [rank]
      FROM dbo.articles AS a
      JOIN dbo.profiles AS p ON p.id = a.author_id
     WHERE (${sql.join(groepen, sql` OR `)})
       AND ${filter(v)}
     ORDER BY [rank] DESC, a.updated_at DESC, a.id
    OFFSET ${v.offset} ROWS FETCH NEXT ${v.limit} ROWS ONLY
  `.execute(db);
  return rows;
}

/**
 * Zoeken op SQL Server. Bewuste verschillen met Postgres: een zoekvraag met
 * alleen uitsluitingen vindt niets; frases zijn exact; samengestelde woorden
 * worden gesplitst ("bank" vindt "kennisbank"); een net opgeslagen artikel is
 * pas na enkele seconden vindbaar (full-text); gelijke rang heeft een vaste
 * volgorde; op SQL Server 2016–2022 vindt een woord ook alle woorden die met
 * zijn ruwe stam beginnen ("artikelen" vindt "artikel", maar ook "artikelsgewijs").
 */
export async function zoekMssql(db: Db, params: ZoekParams): Promise<ZoekRij[]> {
  const groepen = parseZoekvraag(params.query);
  const v: Vraag = {
    statuses: [...new Set(params.statuses)],
    tagSlugs: [...new Set(params.tagSlugs ?? [])],
    limit: geheel(params.limit, 1, MAX_LIMIET, 20),
    offset: geheel(params.offset, 0, MAX_OFFSET, 0),
  };
  // Alleen stopwoorden, leestekens of uitsluitingen: geen resultaten (zoals
  // Postgres bij een lege tsquery), en nooit een lege CONTAINS-voorwaarde
  // (fout 7645). Geen status: niets, zoals status = ANY('{}') in Postgres.
  if (groepen.length === 0 || v.statuses.length === 0) return [];

  const status = await leesFulltextStatus(db);
  if (status.actief) {
    try {
      return await zoekMetFulltext(db, v, naarContains(groepen, status.opties)!, naarBonus(groepen, status.opties)!);
    } catch (err) {
      const nummers = foutNummers(err).filter(isFulltextFout);
      if (nummers.length === 0) throw err;
      console.error(`[zoeken] full-text-fout ${nummers.join(", ")}, terugval op LIKE:`, err);
      if (!nummers.every((n) => VRAAGFOUTEN.has(n))) {
        fulltextStatus = { ...status, actief: false, tot: Date.now() + FULLTEXT_CONTROLE_MS };
      }
    }
  }
  return zoekMetLike(db, v, naarLike(groepen)!);
}
