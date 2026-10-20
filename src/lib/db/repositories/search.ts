import "server-only";
import { sql } from "kysely";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { parseJson, toIso } from "@/lib/db/dialect";
import { zoekMssql } from "@/lib/db/search/mssql";
import type { ZoekParams, ZoekRij } from "@/lib/db/search/types";
import type { ArticleStatus, SearchResult } from "@/types";

/**
 * Nederlandse full-text search op Postgres, via de bestaande functie
 * search_articles (gewogen tsvector, websearch_to_tsquery). Benoemde argumenten,
 * omdat de Supabase-database ook nog een oudere overload met 4 argumenten heeft.
 */
async function zoekPostgres(params: ZoekParams): Promise<ZoekRij[]> {
  // updated_at komt niet uit search_articles; via een join in dezelfde vraag,
  // in de volgorde van de functie (WITH ORDINALITY).
  const { rows } = await sql<ZoekRij>`
    SELECT s.id, s.title, s.slug, s.excerpt, s.cover_image_url, s.status, s.author_name,
           s.published_at, a.updated_at, s.tags, s.rank
    FROM search_articles(
      search_query => ${params.query},
      tag_slugs => ${params.tagSlugs}::text[],
      status_filter => ${params.statuses}::text[],
      result_limit => ${params.limit},
      result_offset => ${params.offset}
    ) WITH ORDINALITY AS s
    JOIN articles a ON a.id = s.id
    ORDER BY s.ordinality
  `.execute(getDb());
  return rows;
}

/**
 * Nederlandse full-text search. Postgres: search_articles (hierboven). SQL
 * Server: full-text-index of eenvoudig zoeken met LIKE (src/lib/db/search/mssql.ts).
 */
export async function searchArticlesInDb(params: ZoekParams): Promise<SearchResult[]> {
  const rows = getConfig().db.dialect === "mssql" ? await zoekMssql(getDb(), params) : await zoekPostgres(params);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    excerpt: r.excerpt,
    cover_image_url: r.cover_image_url,
    status: r.status as ArticleStatus,
    author_name: r.author_name,
    published_at: toIso(r.published_at),
    updated_at: toIso(r.updated_at),
    tags: parseJson<{ name: string; slug: string }[] | null>(r.tags, null),
    rank: Number(r.rank),
  }));
}
