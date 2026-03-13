"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { ActionResult, Article, ArticleWithRelations, ArticleSummary, PaginatedResult } from "@/types";
import { ITEMS_PER_PAGE } from "@/lib/constants";

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
  let content: Record<string, unknown> = {};
  try {
    content = JSON.parse(data.content_json);
  } catch {
    return { success: false, error: "Ongeldige content" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Niet ingelogd" };
  }

  // Generate unique slug
  let slug = slugify(data.title);
  const { data: existing } = await supabase
    .from("articles")
    .select("slug")
    .like("slug", `${slug}%`);

  if (existing && existing.length > 0) {
    slug = `${slug}-${existing.length}`;
  }

  const { data: article, error } = await supabase
    .from("articles")
    .insert({
      title: data.title.trim(),
      slug,
      content,
      content_text: data.content_text,
      excerpt: data.excerpt?.trim() || null,
      cover_image_url: data.cover_image_url || null,
      author_id: user.id,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Add tags
  if (data.tag_ids.length > 0) {
    await supabase.from("article_tags").insert(
      data.tag_ids.map((tag_id) => ({
        article_id: article.id,
        tag_id,
      }))
    );
  }

  revalidatePath("/artikelen");
  return { success: true, data: article };
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
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.excerpt !== undefined) updateData.excerpt = data.excerpt?.trim() || null;
  if (data.content_json !== undefined) {
    try {
      updateData.content = JSON.parse(data.content_json);
    } catch {
      return { success: false, error: "Ongeldige content" };
    }
  }
  if (data.content_text !== undefined) updateData.content_text = data.content_text;
  if (data.cover_image_url !== undefined) updateData.cover_image_url = data.cover_image_url || null;

  const { data: article, error } = await supabase
    .from("articles")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Update tags if provided
  if (data.tag_ids !== undefined) {
    await supabase.from("article_tags").delete().eq("article_id", id);
    if (data.tag_ids.length > 0) {
      await supabase.from("article_tags").insert(
        data.tag_ids.map((tag_id) => ({
          article_id: id,
          tag_id,
        }))
      );
    }
  }

  revalidatePath("/artikelen");
  revalidatePath(`/artikelen/${article.slug}`);
  return { success: true, data: article };
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("articles").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/artikelen");
  redirect("/artikelen");
}

export async function submitForReview(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("articles")
    .update({ status: "in_review" })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/artikelen");
  return { success: true };
}

export async function publishArticle(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Niet ingelogd" };
  }

  const { error } = await supabase
    .from("articles")
    .update({
      status: "published",
      reviewer_id: user.id,
      reviewed_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/artikelen");
  return { success: true };
}

export async function revertToDraft(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("articles")
    .update({
      status: "draft",
      reviewer_id: null,
      reviewed_at: null,
      published_at: null,
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/artikelen");
  return { success: true };
}

export async function getArticles(params?: {
  page?: number;
  tag?: string;
  status?: string;
}): Promise<PaginatedResult<ArticleSummary>> {
  const supabase = await createClient();
  const page = params?.page ?? 1;
  const from = (page - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE - 1;

  let query = supabase
    .from("articles")
    .select(
      "id, title, slug, excerpt, cover_image_url, status, published_at, is_pinned, created_at, updated_at, author:profiles!author_id(id, email, display_name, avatar_url, is_admin, created_at, updated_at), article_tags(tag:tags(id, name, slug, created_at))",
      { count: "exact" }
    )
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params?.tag) {
    query = query.eq("article_tags.tag.slug", params.tag);
  }

  const { data, count, error } = await query;

  if (error || !data) {
    return { data: [], count: 0, page, totalPages: 0 };
  }

  const articles: ArticleSummary[] = data.map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    excerpt: item.excerpt,
    cover_image_url: item.cover_image_url,
    status: item.status as ArticleSummary["status"],
    author: item.author as unknown as ArticleSummary["author"],
    tags: (item.article_tags as unknown as { tag: ArticleSummary["tags"][number] }[])
      ?.map((at) => at.tag)
      .filter(Boolean) ?? [],
    published_at: item.published_at,
    is_pinned: item.is_pinned,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }));

  return {
    data: articles,
    count: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / ITEMS_PER_PAGE),
  };
}

export async function getArticleBySlug(
  slug: string
): Promise<ArticleWithRelations | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("articles")
    .select(
      "*, author:profiles!author_id(id, email, display_name, avatar_url, is_admin, created_at, updated_at), reviewer:profiles!reviewer_id(id, email, display_name, avatar_url, is_admin, created_at, updated_at), article_tags(tag:tags(id, name, slug, created_at))"
    )
    .eq("slug", slug)
    .single();

  if (error || !data) return null;

  return {
    ...data,
    author: data.author as unknown as ArticleWithRelations["author"],
    reviewer: data.reviewer as unknown as ArticleWithRelations["reviewer"],
    tags:
      (data.article_tags as unknown as { tag: ArticleWithRelations["tags"][number] }[])
        ?.map((at) => at.tag)
        .filter(Boolean) ?? [],
  };
}

export async function togglePinArticle(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: article } = await supabase
    .from("articles")
    .select("is_pinned")
    .eq("id", id)
    .single();

  if (!article) {
    return { success: false, error: "Artikel niet gevonden" };
  }

  const { error } = await supabase
    .from("articles")
    .update({ is_pinned: !article.is_pinned })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/artikelen");
  return { success: true };
}
