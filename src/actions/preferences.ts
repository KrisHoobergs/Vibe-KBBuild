"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, NIET_INGELOGD } from "@/lib/auth";
import { updateProfileFields } from "@/lib/db/repositories/profiles";
import { ITEMS_PER_PAGE, ITEMS_PER_PAGE_OPTIONS } from "@/lib/constants";
import type { ActionResult, ArticleSort, Theme } from "@/types";

const THEMES: Theme[] = ["light", "dark", "system"];
const SORTS: ArticleSort[] = ["updated_at", "title"];

export async function getPreferences(): Promise<{
  items_per_page: number;
  default_sort: ArticleSort;
}> {
  const fallback = { items_per_page: ITEMS_PER_PAGE, default_sort: "updated_at" as const };

  const user = await getCurrentUser();
  if (!user) return fallback;

  return {
    items_per_page: user.items_per_page ?? fallback.items_per_page,
    default_sort: user.default_sort ?? fallback.default_sort,
  };
}

/** Weergavenaam van de ingelogde gebruiker (vroeger rechtstreeks vanuit de browser). */
export async function updateProfile(data: { display_name: string }): Promise<ActionResult> {
  const displayName = data.display_name.trim();
  if (!displayName) {
    return { success: false, error: "Weergavenaam is verplicht" };
  }
  if (displayName.length > 100) {
    return { success: false, error: "Weergavenaam is te lang (max. 100 tekens)" };
  }

  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  try {
    await updateProfileFields(user.id, { display_name: displayName });
  } catch (error) {
    console.error("Profiel opslaan mislukt:", error);
    return { success: false, error: "Fout bij opslaan" };
  }

  revalidatePath("/", "layout");
  return { success: true };
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

  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  try {
    await updateProfileFields(user.id, {
      theme: data.theme,
      items_per_page: data.items_per_page,
      default_sort: data.default_sort,
    });
  } catch (error) {
    console.error("Voorkeuren opslaan mislukt:", error);
    return { success: false, error: "Opslaan mislukt" };
  }

  revalidatePath("/profiel");
  revalidatePath("/artikelen");
  return { success: true };
}
