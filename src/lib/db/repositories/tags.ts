import "server-only";
import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import { getDb } from "@/lib/db";
import { isUniqueViolation, toIso } from "@/lib/db/dialect";
import type { TagsTable } from "@/lib/db/schema";
import type { Tag, TagWithCount } from "@/types";

const KOLOMMEN = ["tags.id", "tags.name", "tags.slug", "tags.created_at"] as const;

function naarTag(rij: Selectable<TagsTable>): Tag {
  return { id: rij.id, name: rij.name, slug: rij.slug, created_at: toIso(rij.created_at) };
}

export async function listTags(): Promise<Tag[]> {
  const rijen = await getDb().selectFrom("tags").select(KOLOMMEN).orderBy("name").execute();
  return rijen.map(naarTag);
}

export async function getTagBySlugFromDb(slug: string): Promise<Tag | null> {
  const rij = await getDb()
    .selectFrom("tags")
    .select(KOLOMMEN)
    .where("slug", "=", slug)
    .executeTakeFirst();
  return rij ? naarTag(rij) : null;
}

export async function listTagsWithCounts(): Promise<TagWithCount[]> {
  const rijen = await getDb()
    .selectFrom("tags")
    .leftJoin("article_tags", "article_tags.tag_id", "tags.id")
    .select(KOLOMMEN)
    .select((eb) => eb.fn.count<number>("article_tags.article_id").as("article_count"))
    .groupBy(KOLOMMEN)
    .orderBy("tags.name")
    .execute();
  return rijen.map((rij) => ({ ...naarTag(rij), article_count: Number(rij.article_count) }));
}

export type NieuweTagResultaat = { ok: true; tag: Tag } | { ok: false; reden: "bestaat" };

export async function insertTag(name: string, slug: string): Promise<NieuweTagResultaat> {
  const rij = { id: randomUUID(), name, slug, created_at: new Date() };
  try {
    await getDb().insertInto("tags").values(rij).execute();
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reden: "bestaat" };
    throw err;
  }
  return { ok: true, tag: naarTag(rij) };
}

export async function deleteTagById(id: string): Promise<void> {
  // article_tags-rijen verdwijnen via ON DELETE CASCADE.
  await getDb().deleteFrom("tags").where("id", "=", id).execute();
}

/** Tags per artikel, voor een reeks artikelen in één query. */
/** De tags van één artikel, op slug: zonder eerst het id van het artikel op te zoeken. */
export async function tagsForArticleSlug(slug: string): Promise<Tag[]> {
  const rijen = await getDb()
    .selectFrom("article_tags")
    .innerJoin("tags", "tags.id", "article_tags.tag_id")
    .innerJoin("articles", "articles.id", "article_tags.article_id")
    .select(KOLOMMEN)
    .where("articles.slug", "=", slug)
    .orderBy("tags.name")
    .execute();
  return rijen.map(naarTag);
}

export async function tagsForArticles(articleIds: string[]): Promise<Map<string, Tag[]>> {
  const perArtikel = new Map<string, Tag[]>();
  if (articleIds.length === 0) return perArtikel;

  const rijen = await getDb()
    .selectFrom("article_tags")
    .innerJoin("tags", "tags.id", "article_tags.tag_id")
    .select(["article_tags.article_id", ...KOLOMMEN])
    .where("article_tags.article_id", "in", articleIds)
    .orderBy("tags.name")
    .execute();

  for (const rij of rijen) {
    const lijst = perArtikel.get(rij.article_id) ?? [];
    lijst.push(naarTag(rij));
    perArtikel.set(rij.article_id, lijst);
  }
  return perArtikel;
}
