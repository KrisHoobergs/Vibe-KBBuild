-- =============================================================
-- Zoekfunctie uitbreiden: optioneel filteren op artikelstatus
-- =============================================================

CREATE OR REPLACE FUNCTION public.search_articles(
  search_query TEXT,
  tag_slugs TEXT[] DEFAULT NULL,
  status_filter TEXT[] DEFAULT ARRAY['published'],
  result_limit INT DEFAULT 20,
  result_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  excerpt TEXT,
  cover_image_url TEXT,
  status TEXT,
  author_name TEXT,
  published_at TIMESTAMPTZ,
  tags JSONB,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.slug,
    a.excerpt,
    a.cover_image_url,
    a.status,
    p.display_name AS author_name,
    a.published_at,
    (
      SELECT jsonb_agg(jsonb_build_object('name', t.name, 'slug', t.slug))
      FROM public.article_tags at2
      JOIN public.tags t ON t.id = at2.tag_id
      WHERE at2.article_id = a.id
    ) AS tags,
    ts_rank_cd(a.search_vector, websearch_to_tsquery('dutch', search_query)) AS rank
  FROM public.articles a
  JOIN public.profiles p ON p.id = a.author_id
  WHERE
    a.status = ANY(status_filter)
    AND a.search_vector @@ websearch_to_tsquery('dutch', search_query)
    AND (
      tag_slugs IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.article_tags at3
        JOIN public.tags t2 ON t2.id = at3.tag_id
        WHERE at3.article_id = a.id
        AND t2.slug = ANY(tag_slugs)
      )
    )
  ORDER BY rank DESC
  LIMIT result_limit
  OFFSET result_offset;
END;
$$ LANGUAGE plpgsql STABLE;
