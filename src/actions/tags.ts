"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createTagSchema } from "@/lib/validations/tag";
import { slugify } from "@/lib/utils";
import type { ActionResult, Tag, TagWithCount } from "@/types";

export async function createTag(formData: FormData): Promise<ActionResult<Tag>> {
  const parsed = createTagSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const slug = slugify(parsed.data.name);

  const { data, error } = await supabase
    .from("tags")
    .insert({ name: parsed.data.name, slug })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Deze tag bestaat al" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/tags");
  revalidatePath("/artikelen");
  return { success: true, data };
}

export async function deleteTag(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("tags").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/tags");
  revalidatePath("/artikelen");
  return { success: true };
}

export async function getAllTags(): Promise<Tag[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tags")
    .select("*")
    .order("name");

  return data ?? [];
}

export async function getTagsWithCounts(): Promise<TagWithCount[]> {
  const supabase = await createClient();

  const { data: tags } = await supabase
    .from("tags")
    .select("*, article_tags(count)")
    .order("name");

  if (!tags) return [];

  return tags.map((tag) => ({
    ...tag,
    article_count: (tag.article_tags as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));
}
