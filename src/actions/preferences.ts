"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ITEMS_PER_PAGE, ITEMS_PER_PAGE_OPTIONS } from "@/lib/constants";
import type { ActionResult, ArticleSort, Theme } from "@/types";

const THEMES: Theme[] = ["light", "dark", "system"];
const SORTS: ArticleSort[] = ["updated_at", "title"];

export async function getPreferences(): Promise<{
  items_per_page: number;
  default_sort: ArticleSort;
}> {
  const fallback = { items_per_page: ITEMS_PER_PAGE, default_sort: "updated_at" as const };

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (!userId) return fallback;

  const { data } = await supabase
    .from("profiles")
    .select("items_per_page, default_sort")
    .eq("id", userId)
    .single();

  if (!data) return fallback;

  return {
    items_per_page: data.items_per_page ?? fallback.items_per_page,
    default_sort: (data.default_sort as ArticleSort) ?? fallback.default_sort,
  };
}

export async function updatePreferences(data: {
  theme: Theme;
  items_per_page: number;
  default_sort: ArticleSort;
}): Promise<ActionResult> {
  if (!THEMES.includes(data.theme)) {
    return { success: false, error: "Ongeldig thema" };
  }

  if (!ITEMS_PER_PAGE_OPTIONS.includes(data.items_per_page as 10 | 20 | 50 | 100)) {
    return { success: false, error: "Ongeldig aantal artikelen per pagina" };
  }

  if (!SORTS.includes(data.default_sort)) {
    return { success: false, error: "Ongeldige sortering" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Niet ingelogd" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      theme: data.theme,
      items_per_page: data.items_per_page,
      default_sort: data.default_sort,
    })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/profiel");
  revalidatePath("/artikelen");
  return { success: true };
}
