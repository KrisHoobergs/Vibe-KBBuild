"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, NIET_INGELOGD } from "@/lib/auth";
import {
  deleteTagById,
  getTagBySlugFromDb,
  insertTag,
  listTags,
  listTagsWithCounts,
} from "@/lib/db/repositories/tags";
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

  if (!(await getCurrentUser())) return NIET_INGELOGD;

  try {
    const resultaat = await insertTag(parsed.data.name, slugify(parsed.data.name));
    if (!resultaat.ok) {
      return { success: false, error: "Deze tag bestaat al" };
    }
    revalidatePath("/tags");
    revalidatePath("/artikelen");
    return { success: true, data: resultaat.tag };
  } catch (error) {
    console.error("Tag aanmaken mislukt:", error);
    return { success: false, error: "Tag aanmaken mislukt" };
  }
}

export async function deleteTag(id: string): Promise<ActionResult> {
  if (!(await getCurrentUser())) return NIET_INGELOGD;

  try {
    await deleteTagById(id);
  } catch (error) {
    console.error("Tag verwijderen mislukt:", error);
    return { success: false, error: "Tag verwijderen mislukt" };
  }

  revalidatePath("/tags");
  revalidatePath("/artikelen");
  return { success: true };
}

export async function getAllTags(): Promise<Tag[]> {
  if (!(await getCurrentUser())) return [];
  return listTags();
}

export async function getTagBySlug(slug: string): Promise<Tag | null> {
  if (!(await getCurrentUser())) return null;
  return getTagBySlugFromDb(slug);
}

export async function getTagsWithCounts(): Promise<TagWithCount[]> {
  if (!(await getCurrentUser())) return [];
  return listTagsWithCounts();
}
