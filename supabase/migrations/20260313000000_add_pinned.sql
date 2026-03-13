-- Add pinned column to articles table
ALTER TABLE public.articles ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Composite index for pinned-first sorting
CREATE INDEX idx_articles_pinned ON public.articles (is_pinned DESC, updated_at DESC);
