import "server-only";
import { randomUUID } from "node:crypto";
import type { Kysely, Selectable, Transaction } from "kysely";
import { getDb } from "@/lib/db";
import { isUniqueViolation, parseJson, toIso } from "@/lib/db/dialect";
import type { ArticlesTable, Database } from "@/lib/db/schema";
import { naarProfile } from "@/lib/db/repositories/profiles";
import { tagsForArticles, tagsForArticleSlug } from "@/lib/db/repositories/tags";
import { slugify } from "@/lib/utils";
import type {
  Article,
  ArticleSort,
  ArticleStatus,
  ArticleSummary,
  ArticleWithRelations,
  PaginatedResult,
} from "@/types";

type Db = Kysely<Database> | Transaction<Database>;

// Nooit selectAll() op articles: in Postgres zit daar ook de grote, gegenereerde
// search_vector in.
const ARTIKEL_KOLOMMEN = [
  "articles.id",
  "articles.title",
  "articles.slug",
  "articles.content",
  "articles.content_text",
  "articles.excerpt",
  "articles.cover_image_url",
  "articles.status",
  "articles.author_id",
  "articles.reviewer_id",
  "articles.reviewed_at",
  "articles.published_at",
  "articles.is_pinned",
  "articles.pin_order",
  "articles.created_at",
  "articles.updated_at",
] as const;

function naarArticle(rij: Selectable<ArticlesTable>): Article {
  return {
    id: rij.id,
    title: rij.title,
    slug: rij.slug,
    content: parseJson<Record<string, unknown>>(rij.content, {}),
    content_text: rij.content_text,
    excerpt: rij.excerpt,
    cover_image_url: rij.cover_image_url,
    status: rij.status as ArticleStatus,
    author_id: rij.author_id,
    reviewer_id: rij.reviewer_id,
    reviewed_at: toIso(rij.reviewed_at),
    published_at: toIso(rij.published_at),
    is_pinned: Boolean(rij.is_pinned),
    pin_order: Number(rij.pin_order),
    created_at: toIso(rij.created_at),
    updated_at: toIso(rij.updated_at),
  };
}

async function haalArtikel(db: Db, id: string): Promise<Article | null> {
  const rij = await db
    .selectFrom("articles")
    .select(ARTIKEL_KOLOMMEN)
    .where("articles.id", "=", id)
    .executeTakeFirst();
  return rij ? naarArticle(rij) : null;
}

// ---------------------------------------------------------------- lezen

export async function listArticles(params: {
  page: number;
  perPage: number;
  sort: ArticleSort;
  tagSlugs: string[];
  status?: string;
}): Promise<PaginatedResult<ArticleSummary>> {
  const { page, perPage, sort, tagSlugs } = params;
  const offset = (page - 1) * perPage;

  let query = getDb()
    .selectFrom("articles")
    .innerJoin("profiles as author", "author.id", "articles.author_id")
    .select([
      "articles.id",
      "articles.title",
      "articles.slug",
      "articles.excerpt",
      "articles.cover_image_url",
      "articles.status",
      "articles.published_at",
      "articles.is_pinned",
      "articles.pin_order",
      "articles.created_at",
      "articles.updated_at",
      "author.id as author_id",
      "author.display_name as author_display_name",
      "author.avatar_url as author_avatar_url",
    ]);

  // Een artikel moet ALLE gekozen tags hebben (AND), niet minstens één.
  if (tagSlugs.length > 0) {
    query = query.where("articles.id", "in", (eb) =>
      eb
        .selectFrom("article_tags")
        .innerJoin("tags", "tags.id", "article_tags.tag_id")
        .select("article_tags.article_id")
        .where("tags.slug", "in", tagSlugs)
        .groupBy("article_tags.article_id")
        .having((h) => h.fn.count("tags.slug").distinct(), "=", tagSlugs.length)
    );
  }

  if (params.status && params.status !== "all") {
    query = query.where("articles.status", "=", params.status);
  }

  // Eén rij extra ophalen om te weten of er een volgende pagina is, zonder
  // count-query. offset/fetch werkt op zowel Postgres als SQL Server.
  const rijen = await query
    .orderBy("articles.is_pinned", "desc")
    .orderBy("articles.pin_order", "asc")
    .orderBy(sort === "title" ? "articles.title" : "articles.updated_at", sort === "title" ? "asc" : "desc")
    .orderBy("articles.id")
    .offset(offset)
    .fetch(perPage + 1)
    .execute();

  const hasMore = rijen.length > perPage;
  const pagina = rijen.slice(0, perPage);
  const tags = await tagsForArticles(pagina.map((r) => r.id));

  return {
    page,
    hasMore,
    data: pagina.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      cover_image_url: r.cover_image_url,
      status: r.status as ArticleStatus,
      author: {
        id: r.author_id,
        display_name: r.author_display_name,
        avatar_url: r.author_avatar_url,
      },
      tags: tags.get(r.id) ?? [],
      published_at: toIso(r.published_at),
      is_pinned: Boolean(r.is_pinned),
      pin_order: Number(r.pin_order),
      created_at: toIso(r.created_at),
      updated_at: toIso(r.updated_at),
    })),
  };
}

export async function getArticleWithRelations(slug: string): Promise<ArticleWithRelations | null> {
  const db = getDb();
  // Artikel, auteur/reviewer en tags tegelijk, alle drie op slug: één
  // wachtronde naar de database in plaats van twee na elkaar.
  const [rij, profielen, tags] = await Promise.all([
    db.selectFrom("articles").select(ARTIKEL_KOLOMMEN).where("articles.slug", "=", slug).executeTakeFirst(),
    db
      .selectFrom("profiles")
      .select([
        "id",
        "email",
        "display_name",
        "avatar_url",
        "is_admin",
        "theme",
        "items_per_page",
        "default_sort",
        "created_at",
        "updated_at",
      ])
      .where((eb) =>
        eb.or([
          eb("id", "in", eb.selectFrom("articles").select("articles.author_id").where("articles.slug", "=", slug)),
          eb("id", "in", eb.selectFrom("articles").select("articles.reviewer_id").where("articles.slug", "=", slug)),
        ])
      )
      .execute(),
    tagsForArticleSlug(slug),
  ]);
  if (!rij) return null;

  const article = naarArticle(rij);
  const perId = new Map(profielen.map((p) => [p.id, naarProfile(p)]));
  const author = perId.get(article.author_id);
  if (!author) return null;

  return {
    ...article,
    author,
    reviewer: article.reviewer_id ? (perId.get(article.reviewer_id) ?? null) : null,
    tags,
  };
}

// ---------------------------------------------------------------- schrijven

/** Eerste vrije slug: "titel", anders "titel-1", "titel-2", … */
async function vrijeSlug(db: Db, titel: string): Promise<string> {
  const basis = slugify(titel) || "artikel";
  // slugify geeft alleen [a-z0-9-], dus geen LIKE-jokertekens om te escapen.
  const bestaand = new Set(
    (
      await db
        .selectFrom("articles")
        .select("slug")
        .where("slug", "like", `${basis}%`)
        .execute()
    ).map((r) => r.slug)
  );
  if (!bestaand.has(basis)) return basis;
  for (let n = 1; ; n++) {
    const kandidaat = `${basis}-${n}`;
    if (!bestaand.has(kandidaat)) return kandidaat;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vervangt de tags van een artikel. Alleen tags die (nog) bestaan worden
 * gekoppeld: een tag die iemand intussen verwijderde, blokkeert het opslaan
 * van het artikel niet.
 */
async function zetTags(db: Db, articleId: string, tagIds: string[]) {
  await db.deleteFrom("article_tags").where("article_id", "=", articleId).execute();
  const uniek = [...new Set(tagIds)].filter((id) => UUID.test(id));
  if (uniek.length > 0) {
    await db
      .insertInto("article_tags")
      .columns(["article_id", "tag_id"])
      .expression((eb) =>
        eb
          .selectFrom("tags")
          .select([eb.val(articleId).as("article_id"), "tags.id as tag_id"])
          .where("tags.id", "in", uniek)
      )
      .execute();
  }
}

export async function insertArticle(
  input: {
    title: string;
    excerpt: string | null;
    content: Record<string, unknown>;
    content_text: string;
    cover_image_url: string | null;
    tag_ids: string[];
  },
  authorId: string
): Promise<Article> {
  // Bij een gelijktijdige insert met dezelfde slug: opnieuw proberen.
  for (let poging = 1; ; poging++) {
    try {
      return await getDb()
        .transaction()
        .execute(async (trx) => {
          const id = randomUUID();
          const nu = new Date();
          await trx
            .insertInto("articles")
            .values({
              id,
              title: input.title,
              slug: await vrijeSlug(trx, input.title),
              content: JSON.stringify(input.content),
              content_text: input.content_text,
              excerpt: input.excerpt,
              cover_image_url: input.cover_image_url,
              status: "draft",
              author_id: authorId,
              created_at: nu,
              updated_at: nu,
            })
            .execute();
          await zetTags(trx, id, input.tag_ids);
          return (await haalArtikel(trx, id))!;
        });
    } catch (err) {
      if (poging < 3 && isUniqueViolation(err)) continue;
      throw err;
    }
  }
}

export async function updateArticleById(
  id: string,
  velden: Partial<{
    title: string;
    excerpt: string | null;
    content: Record<string, unknown>;
    content_text: string;
    cover_image_url: string | null;
  }>,
  tagIds?: string[]
): Promise<Article | null> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const { content, ...rest } = velden;
      const resultaat = await trx
        .updateTable("articles")
        .set({
          ...rest,
          ...(content !== undefined ? { content: JSON.stringify(content) } : {}),
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .executeTakeFirst();
      if (Number(resultaat.numUpdatedRows) === 0) return null;

      if (tagIds !== undefined) await zetTags(trx, id, tagIds);
      return haalArtikel(trx, id);
    });
}

export async function deleteArticleById(id: string): Promise<void> {
  // article_tags-rijen verdwijnen via ON DELETE CASCADE.
  await getDb().deleteFrom("articles").where("id", "=", id).execute();
}

export async function setArticleStatus(
  id: string,
  status: ArticleStatus,
  reviewerId?: string
): Promise<boolean> {
  const nu = new Date();
  const velden =
    status === "published"
      ? { status, reviewer_id: reviewerId ?? null, reviewed_at: nu, published_at: nu }
      : status === "draft"
        ? { status, reviewer_id: null, reviewed_at: null, published_at: null }
        : { status };

  const resultaat = await getDb()
    .updateTable("articles")
    .set({ ...velden, updated_at: nu })
    .where("id", "=", id)
    .executeTakeFirst();
  return Number(resultaat.numUpdatedRows) > 0;
}

/** Pin aan/uit. Bij aanzetten komt het artikel achteraan de gepinde lijst. */
export async function togglePin(id: string): Promise<boolean> {
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const artikel = await trx
        .selectFrom("articles")
        .select("is_pinned")
        .where("id", "=", id)
        .executeTakeFirst();
      if (!artikel) return false;

      let pinOrder = 0;
      if (!artikel.is_pinned) {
        const max = await trx
          .selectFrom("articles")
          .select((eb) => eb.fn.max("pin_order").as("max"))
          .where("is_pinned", "=", true)
          .executeTakeFirst();
        pinOrder = max?.max === null || max?.max === undefined ? 0 : Number(max.max) + 1;
      }

      await trx
        .updateTable("articles")
        .set({ is_pinned: !artikel.is_pinned, pin_order: pinOrder })
        .where("id", "=", id)
        .execute();
      return true;
    });
}

export async function reorderPinned(orderedIds: string[]): Promise<void> {
  await getDb()
    .transaction()
    .execute(async (trx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await trx.updateTable("articles").set({ pin_order: i }).where("id", "=", orderedIds[i]).execute();
      }
    });
}
