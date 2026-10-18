"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, getIdentity, NIET_INGELOGD } from "@/lib/auth";
import {
  deleteArticleById,
  getArticleWithRelations,
  insertArticle,
  listArticles,
  reorderPinned,
  setArticleStatus,
  togglePin,
  updateArticleById,
} from "@/lib/db/repositories/articles";
import type { ActionResult, Article, ArticleWithRelations, ArticleSort, ArticleSummary, PaginatedResult } from "@/types";
import { ITEMS_PER_PAGE } from "@/lib/constants";

const NIET_GEVONDEN = { success: false, error: "Artikel niet gevonden" } as const;

function parseContent(json: string): Record<string, unknown> | null {
  try {
    const content = JSON.parse(json);
    return content && typeof content === "object" ? content : null;
  } catch {
    return null;
  }
}

export async function createArticle(data: {
  title: string;
  excerpt?: string;
  content_json: string; // JSON string om Server Action serialisatie-verlies te voorkomen
  content_text: string;
  cover_image_url?: string;
  tag_ids: string[];
}): Promise<ActionResult<Article>> {
  if (!data.title.trim()) {
    return { success: false, error: "Titel is verplicht" };
  }

  // Parse content JSON string terug naar object
  const content = parseContent(data.content_json);
  if (!content) {
    return { success: false, error: "Ongeldige content" };
  }

  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  try {
    const article = await insertArticle(
      {
        title: data.title.trim(),
        excerpt: data.excerpt?.trim() || null,
        content,
        content_text: data.content_text,
        cover_image_url: data.cover_image_url || null,
        tag_ids: data.tag_ids,
      },
      user.id
    );
    revalidatePath("/artikelen");
    return { success: true, data: article };
  } catch (error) {
    console.error("Artikel aanmaken mislukt:", error);
    return { success: false, error: "Opslaan mislukt" };
  }
}

export async function updateArticle(
  id: string,
  data: {
    title?: string;
    excerpt?: string;
    content_json?: string; // JSON string om Server Action serialisatie-verlies te voorkomen
    content_text?: string;
    cover_image_url?: string;
    tag_ids?: string[];
  }
): Promise<ActionResult<Article>> {
  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  const velden: Parameters<typeof updateArticleById>[1] = {};
  if (data.title !== undefined) velden.title = data.title.trim();
  if (data.excerpt !== undefined) velden.excerpt = data.excerpt?.trim() || null;
  if (data.content_json !== undefined) {
    const content = parseContent(data.content_json);
    if (!content) {
      return { success: false, error: "Ongeldige content" };
    }
    velden.content = content;
  }
  if (data.content_text !== undefined) velden.content_text = data.content_text;
  if (data.cover_image_url !== undefined) velden.cover_image_url = data.cover_image_url || null;

  let article: Article | null;
  try {
    article = await updateArticleById(id, velden, data.tag_ids);
  } catch (error) {
    console.error("Artikel bijwerken mislukt:", error);
    return { success: false, error: "Opslaan mislukt" };
  }
  if (!article) return NIET_GEVONDEN;

  revalidatePath("/artikelen");
  revalidatePath(`/artikelen/${article.slug}`);
  return { success: true, data: article };
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  try {
    await deleteArticleById(id);
  } catch (error) {
    console.error("Artikel verwijderen mislukt:", error);
    return { success: false, error: "Verwijderen mislukt" };
  }

  revalidatePath("/artikelen");
  redirect("/artikelen");
}

async function wijzigStatus(
  id: string,
  status: "draft" | "in_review" | "published"
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  try {
    const gevonden = await setArticleStatus(id, status, user.id);
    if (!gevonden) return NIET_GEVONDEN;
  } catch (error) {
    console.error("Status wijzigen mislukt:", error);
    return { success: false, error: "Status wijzigen mislukt" };
  }

  revalidatePath("/artikelen");
  return { success: true };
}

export async function submitForReview(id: string): Promise<ActionResult> {
  return wijzigStatus(id, "in_review");
}

export async function publishArticle(id: string): Promise<ActionResult> {
  return wijzigStatus(id, "published");
}

export async function revertToDraft(id: string): Promise<ActionResult> {
  return wijzigStatus(id, "draft");
}

export async function getArticles(params?: {
  page?: number;
  tag?: string;
  tags?: string[];
  status?: string;
  perPage?: number;
  sort?: ArticleSort;
}): Promise<PaginatedResult<ArticleSummary>> {
  const page = params?.page ?? 1;
  const leeg = { data: [], page, hasMore: false };

  if (!(await getCurrentUser())) return leeg;

  // De enkelvoudige `tag` (tagkaarten, artikelbadges) en de meervoudige `tags`
  // (zoekpaneel) lopen door hetzelfde pad.
  const tagSlugs = [
    ...(params?.tag ? [params.tag] : []),
    ...(params?.tags ?? []),
  ].filter((slug, i, all) => slug && all.indexOf(slug) === i);

  try {
    return await listArticles({
      page,
      perPage: params?.perPage ?? ITEMS_PER_PAGE,
      sort: params?.sort ?? "updated_at",
      tagSlugs,
      status: params?.status,
    });
  } catch (error) {
    console.error("Artikelen ophalen mislukt:", error);
    return leeg;
  }
}

export async function getArticleBySlug(
  slug: string
): Promise<ArticleWithRelations | null> {
  // Eerst alleen de sessie (bij Supabase zonder databasevraag), daarna het
  // profiel en het artikel tegelijk: één wachtronde minder per artikel.
  if (!(await getIdentity())) return null;
  const [user, artikel] = await Promise.all([getCurrentUser(), getArticleWithRelations(slug)]);
  return user ? artikel : null;
}

export async function togglePinArticle(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  try {
    if (!(await togglePin(id))) return NIET_GEVONDEN;
  } catch (error) {
    console.error("Pinnen mislukt:", error);
    return { success: false, error: "Pinnen mislukt" };
  }

  revalidatePath("/artikelen");
  return { success: true };
}

export async function reorderPinnedArticles(orderedIds: string[]): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  try {
    await reorderPinned(orderedIds);
  } catch (error) {
    console.error("Volgorde opslaan mislukt:", error);
    return { success: false, error: "Volgorde opslaan mislukt" };
  }

  revalidatePath("/artikelen");
  return { success: true };
}
