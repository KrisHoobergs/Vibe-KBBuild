/**
 * Vergelijkt de oude datalaag (PostgREST via supabase-js, tegen PRODUCTIE,
 * alleen SELECT) met de nieuwe (Kysely, tegen de LOKALE kopie van productie).
 * Bij gelijke data moet de uitvoer gelijk zijn.
 *
 *   npm run db:vergelijk
 *
 * Vereist: lokale database draait (npm run db:lokaal) en bevat een verse
 * back-up van productie (npm run db:backup, daarna db:lokaal -- import laatste).
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
if (existsSync(path.join(ROOT, ".env.local"))) process.loadEnvFile(path.join(ROOT, ".env.local"));

// De nieuwe laag moet tegen de lokale kopie draaien, nooit tegen productie.
const LOKAAL = process.env.LOKALE_DATABASE_URL ?? "postgres://postgres:lokaal@localhost:54329/kbbuild";
process.env.DATABASE_URL = LOKAAL;
process.env.AUTH_DRIVER = "supabase";
process.env.STORAGE_DRIVER = "supabase";
process.env.DB_DIALECT = "postgres";

const { assertLokaleDatabase } = await import("../src/lib/db/guard");
assertLokaleDatabase(LOKAAL);

const { listArticles, getArticleWithRelations } = await import("../src/lib/db/repositories/articles");
const { listTagsWithCounts, listTags } = await import("../src/lib/db/repositories/tags");
const { searchArticlesInDb } = await import("../src/lib/db/repositories/search");
const { listProfiles } = await import("../src/lib/db/repositories/profiles");
const { getDb } = await import("../src/lib/db/index");

// Oude laag: service-role-sleutel, uitsluitend select/rpc (lezen).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ---------------------------------------------------------------- normaliseren

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
type TagLike = { id?: string; name: string; slug: string; created_at?: string };
const tagsSorted = <T extends TagLike>(tags: T[] | null | undefined) =>
  (tags ?? [])
    .map((t) => ({ ...t, ...(t.created_at ? { created_at: iso(t.created_at) } : {}) }))
    .sort((a, b) => a.name.localeCompare(b.name));

function normaliseerSummary(a: Record<string, unknown>) {
  return {
    ...a,
    published_at: iso(a.published_at),
    created_at: iso(a.created_at),
    updated_at: iso(a.updated_at),
    tags: tagsSorted(a.tags as TagLike[]),
  };
}

// ---------------------------------------------------------------- oude queries (kopie van de vorige code)

async function oudGetArticles(p: { page: number; perPage: number; sort: "updated_at" | "title"; tagSlugs: string[]; status?: string }) {
  const from = (p.page - 1) * p.perPage;
  const to = from + p.perPage;
  let ids: string[] | null = null;
  if (p.tagSlugs.length > 1) {
    const { data } = await supabase.rpc("article_ids_with_all_tags", { tag_slugs: p.tagSlugs });
    ids = (data as string[] | null) ?? [];
    if (ids.length === 0) return { data: [], page: p.page, hasMore: false };
  }
  const basis =
    "id, title, slug, excerpt, cover_image_url, status, published_at, is_pinned, pin_order, created_at, updated_at, author:profiles!author_id(id, display_name, avatar_url), article_tags(tag:tags(id, name, slug, created_at))";
  const metMatch =
    "id, title, slug, excerpt, cover_image_url, status, published_at, is_pinned, pin_order, created_at, updated_at, author:profiles!author_id(id, display_name, avatar_url), match:article_tags!inner(tag:tags!inner(slug)), article_tags(tag:tags(id, name, slug, created_at))";
  let q;
  if (ids) q = supabase.from("articles").select(basis).in("id", ids);
  else if (p.tagSlugs.length === 1) q = supabase.from("articles").select(metMatch).eq("match.tag.slug", p.tagSlugs[0]);
  else q = supabase.from("articles").select(basis);
  q = q
    .order("is_pinned", { ascending: false })
    .order("pin_order", { ascending: true })
    .order(p.sort, { ascending: p.sort === "title" })
    .range(from, to);
  if (p.status && p.status !== "all") q = q.eq("status", p.status);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data as unknown as Record<string, unknown>[];
  return {
    page: p.page,
    hasMore: rows.length > p.perPage,
    data: rows.slice(0, p.perPage).map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      cover_image_url: r.cover_image_url,
      status: r.status,
      author: r.author,
      tags: ((r.article_tags as { tag: TagLike }[]) ?? []).map((at) => at.tag).filter(Boolean),
      published_at: r.published_at,
      is_pinned: r.is_pinned,
      pin_order: r.pin_order,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  };
}

// ---------------------------------------------------------------- vergelijken

let verschillen = 0;
let controles = 0;

/** JSON met gesorteerde sleutels: de volgorde van velden telt niet mee. */
function stabiel(v: unknown): string {
  return JSON.stringify(v, (_k, waarde) =>
    waarde && typeof waarde === "object" && !Array.isArray(waarde)
      ? Object.fromEntries(Object.entries(waarde).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : waarde
  );
}

function vergelijk(naam: string, oud: unknown, nieuw: unknown) {
  controles++;
  const a = stabiel(oud);
  const b = stabiel(nieuw);
  if (a !== b) {
    verschillen++;
    console.log(`✗ ${naam}`);
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    console.log(`    oud:   …${a.slice(Math.max(0, i - 80), i + 120)}`);
    console.log(`    nieuw: …${b.slice(Math.max(0, i - 80), i + 120)}`);
  }
}

async function main() {
  const tags = await listTags();
  const slugs = tags.map((t) => t.slug);
  const tagCombinaties: string[][] = [[], ...slugs.slice(0, 4).map((s) => [s]), slugs.slice(0, 2), slugs.slice(1, 3), slugs.slice(0, 3)];

  // Artikellijsten
  for (const tagSlugs of tagCombinaties) {
    for (const status of [undefined, "published", "draft", "in_review"]) {
      for (const sort of ["updated_at", "title"] as const) {
        for (const [page, perPage] of [[1, 10], [2, 10], [1, 20], [1, 100]] as const) {
          const p = { page, perPage, sort, tagSlugs, status };
          const oud = await oudGetArticles(p);
          const nieuw = await listArticles(p);
          vergelijk(
            `lijst ${JSON.stringify(p)}`,
            { ...oud, data: oud.data.map(normaliseerSummary) },
            { ...nieuw, data: nieuw.data.map((a) => normaliseerSummary(a as unknown as Record<string, unknown>)) }
          );
        }
      }
    }
  }

  // Elk artikel afzonderlijk
  const { data: alleSlugs } = await supabase.from("articles").select("slug");
  for (const { slug } of alleSlugs ?? []) {
    const { data: oud } = await supabase
      .from("articles")
      .select(
        "id, title, slug, content, content_text, excerpt, cover_image_url, status, author_id, reviewer_id, reviewed_at, published_at, is_pinned, pin_order, created_at, updated_at, author:profiles!author_id(id, display_name), reviewer:profiles!reviewer_id(id, display_name), article_tags(tag:tags(id, name, slug, created_at))"
      )
      .eq("slug", slug)
      .single();
    const nieuw = await getArticleWithRelations(slug);
    const o = oud as unknown as Record<string, unknown>;
    vergelijk(
      `artikel ${slug}`,
      {
        ...o,
        article_tags: undefined,
        reviewed_at: iso(o.reviewed_at),
        published_at: iso(o.published_at),
        created_at: iso(o.created_at),
        updated_at: iso(o.updated_at),
        tags: tagsSorted(((o.article_tags as { tag: TagLike }[]) ?? []).map((at) => at.tag)),
      },
      nieuw && {
        ...nieuw,
        article_tags: undefined,
        author: { id: nieuw.author.id, display_name: nieuw.author.display_name },
        reviewer: nieuw.reviewer && { id: nieuw.reviewer.id, display_name: nieuw.reviewer.display_name },
        tags: tagsSorted(nieuw.tags),
      }
    );
  }

  // Tags met aantallen
  const { data: oudeTags } = await supabase.from("tags").select("*, article_tags(count)").order("name");
  vergelijk(
    "tags met aantallen",
    (oudeTags ?? []).map((t: Record<string, unknown>) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      created_at: iso(t.created_at),
      article_count: (t.article_tags as { count: number }[])[0]?.count ?? 0,
    })),
    (await listTagsWithCounts()).map((t) => ({ ...t, created_at: iso(t.created_at) }))
  );

  // Profielen
  const { data: oudeProfielen } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  vergelijk(
    "profielen",
    (oudeProfielen ?? []).map((p: Record<string, unknown>) => ({ ...p, created_at: iso(p.created_at), updated_at: iso(p.updated_at) })),
    await listProfiles()
  );

  // Zoeken. De zoekfunctie sorteert alleen op rank: bij gelijke rank is de
  // volgorde willekeurig (ook in productie). Daarom de VOLLEDIGE resultaatset
  // (ruime limiet) vergelijken, bij gelijke rank gesorteerd op id.
  const termen = ["artikel", "artikelen", "de", "test", "installatie", '"exacte zin"', "-test", "a or b", "c#", "node.js"];
  const volgorde = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Number(b.rank) - Number(a.rank) || String(a.id).localeCompare(String(b.id));
  // updated_at komt niet uit de zoekfunctie zelf: de nieuwe code haalt het met
  // een join uit articles. Voor de oude rijen hier dus ook uit articles.
  const { data: wijzigingen, error: wijzigFout } = await supabase.from("articles").select("id, updated_at");
  if (wijzigFout) throw wijzigFout;
  const gewijzigd = new Map(
    ((wijzigingen ?? []) as { id: string; updated_at: string }[]).map((a) => [a.id, a.updated_at])
  );
  for (const query of termen) {
    for (const statuses of [["published"], ["draft", "in_review", "published"]]) {
      for (const tagSlugs of [null, slugs.slice(0, 1)]) {
        const { data: oud, error } = await supabase.rpc("search_articles", {
          search_query: query,
          tag_slugs: tagSlugs,
          status_filter: statuses,
          result_limit: 1000,
          result_offset: 0,
        });
        if (error) throw error;
        const nieuw = await searchArticlesInDb({ query, tagSlugs, statuses, limit: 1000, offset: 0 });
        const norm = (r: Record<string, unknown>) => ({
          ...r,
          published_at: iso(r.published_at),
          updated_at: iso(r.updated_at),
          rank: Math.round(Number(r.rank) * 1e5) / 1e5,
          tags: r.tags ? tagsSorted(r.tags as TagLike[]) : null,
        });
        vergelijk(
          `zoeken ${JSON.stringify({ query, statuses, tagSlugs })}`,
          (oud as Record<string, unknown>[]).map((r) => norm({ ...r, updated_at: gewijzigd.get(String(r.id)) })).sort(volgorde),
          nieuw.map((r) => norm(r as unknown as Record<string, unknown>)).sort(volgorde)
        );
      }
    }
  }

  console.log(`\n${controles} vergelijkingen, ${verschillen} verschillen.`);
  await getDb().destroy();
  if (verschillen > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await getDb().destroy();
});
