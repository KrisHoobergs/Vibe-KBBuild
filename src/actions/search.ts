"use server";

import { createClient } from "@/lib/supabase/server";
import type { SearchResult } from "@/types";

export async function searchArticles(params: {
  query: string;
  tags?: string[];
  statuses?: string[];
  limit?: number;
  offset?: number;
}): Promise<SearchResult[]> {
  if (!params.query.trim()) return [];

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_articles", {
    search_query: params.query,
    tag_slugs: params.tags?.length ? params.tags : null,
    status_filter: params.statuses?.length ? params.statuses : ["published"],
    result_limit: params.limit ?? 20,
    result_offset: params.offset ?? 0,
  });

  if (error) {
    console.error("Search error:", error);
    return [];
  }

  return data ?? [];
}
