-- =============================================================
-- Know-How Space - Initial Database Schema
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- 1. PROFILES TABLE
-- =============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup (first user = admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    (SELECT COUNT(*) = 0 FROM public.profiles)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- 2. TAGS TABLE
-- =============================================================
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tags_slug ON public.tags(slug);

-- =============================================================
-- 3. ARTICLES TABLE
-- =============================================================
CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content JSONB NOT NULL DEFAULT '{}',
  content_text TEXT NOT NULL DEFAULT '',
  excerpt TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'published')),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Full-text search vector (Dutch config)
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('dutch', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('dutch', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('dutch', coalesce(content_text, '')), 'C')
  ) STORED
);

CREATE INDEX idx_articles_slug ON public.articles(slug);
CREATE INDEX idx_articles_status ON public.articles(status);
CREATE INDEX idx_articles_author ON public.articles(author_id);
CREATE INDEX idx_articles_published_at ON public.articles(published_at DESC);
CREATE INDEX idx_articles_search ON public.articles USING GIN(search_vector);

CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- 4. ARTICLE_TAGS JOIN TABLE
-- =============================================================
CREATE TABLE public.article_tags (
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX idx_article_tags_tag ON public.article_tags(tag_id);
CREATE INDEX idx_article_tags_article ON public.article_tags(article_id);

-- =============================================================
-- 5. INVITATIONS TABLE
-- =============================================================
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES public.profiles(id),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);

-- =============================================================
-- 6. SEARCH FUNCTION
-- =============================================================
CREATE OR REPLACE FUNCTION public.search_articles(
  search_query TEXT,
  tag_slugs TEXT[] DEFAULT NULL,
  result_limit INT DEFAULT 20,
  result_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  excerpt TEXT,
  cover_image_url TEXT,
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
    a.status = 'published'
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

-- =============================================================
-- 7. ROW LEVEL SECURITY
-- =============================================================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Articles
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Articles viewable by authenticated users"
  ON public.articles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create articles"
  ON public.articles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authenticated users can update any article"
  ON public.articles FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete any article"
  ON public.articles FOR DELETE TO authenticated USING (true);

-- Tags
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tags viewable by authenticated users"
  ON public.tags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create tags"
  ON public.tags FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update tags"
  ON public.tags FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete tags"
  ON public.tags FOR DELETE TO authenticated USING (true);

-- Article Tags
ALTER TABLE public.article_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Article tags viewable by authenticated users"
  ON public.article_tags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage article tags"
  ON public.article_tags FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can remove article tags"
  ON public.article_tags FOR DELETE TO authenticated USING (true);

-- Invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view invitations"
  ON public.invitations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can create invitations"
  ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- =============================================================
-- 8. STORAGE (run in Supabase dashboard SQL editor)
-- =============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('articles', 'articles', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', false);
