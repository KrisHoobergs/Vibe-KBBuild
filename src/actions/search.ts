"use server";

import { getCurrentUser } from "@/lib/auth";
import { searchArticlesInDb } from "@/lib/db/repositories/search";
import type { SearchResult } from "@/types";

export async function searchArticles(params: {
  query: string;
  tags?: string[];
  statuses?: string[];
  limit?: number;
  offset?: number;
}): Promise<SearchResult[]> {
  if (!params.query.trim()) return [];
  if (!(await getCurrentUser())) return [];

  try {
    return await searchArticlesInDb({
      query: params.query,
      tagSlugs: params.tags?.length ? params.tags : null,
      statuses: params.statuses?.length ? params.statuses : ["published"],
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
    });
  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
}
