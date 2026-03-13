-- Add pin_order column for custom ordering of pinned articles
ALTER TABLE public.articles ADD COLUMN pin_order INTEGER NOT NULL DEFAULT 0;
