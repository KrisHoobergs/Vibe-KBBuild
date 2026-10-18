import { sql } from "kysely";
import type { Migratie } from "../../migrate";

// Basisschema voor gewone PostgreSQL. Dit is dezelfde structuur als de
// public-tabellen van de Supabase-installatie (supabase/migrations), zonder RLS
// en zonder koppeling aan auth.users. Tabellen en indexen met IF NOT EXISTS,
// functies en triggers met CREATE OR REPLACE; nooit DROP of DELETE. De runner
// weigert op een Supabase-database (src/lib/db/migrate.ts).
export const basis: Migratie = {
  naam: "0001_basis",
  transactioneel: true,
  async up(db) {
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        theme TEXT NOT NULL DEFAULT 'system'
          CHECK (theme IN ('light', 'dark', 'system')),
        items_per_page INTEGER NOT NULL DEFAULT 20
          CHECK (items_per_page IN (10, 20, 50, 100)),
        default_sort TEXT NOT NULL DEFAULT 'updated_at'
          CHECK (default_sort IN ('updated_at', 'title')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      CREATE OR REPLACE TRIGGER profiles_updated_at
        BEFORE UPDATE ON profiles
        FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug)`.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS articles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        content JSONB NOT NULL DEFAULT '{}',
        content_text TEXT NOT NULL DEFAULT '',
        excerpt TEXT,
        cover_image_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'in_review', 'published')),
        author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        is_pinned BOOLEAN NOT NULL DEFAULT false,
        pin_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        search_vector TSVECTOR GENERATED ALWAYS AS (
          setweight(to_tsvector('dutch', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('dutch', coalesce(excerpt, '')), 'B') ||
          setweight(to_tsvector('dutch', coalesce(content_text, '')), 'C')
        ) STORED
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug)`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_articles_author ON articles(author_id)`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC)`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_articles_search ON articles USING GIN(search_vector)`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_articles_pinned ON articles(is_pinned DESC, updated_at DESC)`.execute(db);
    await sql`
      CREATE OR REPLACE TRIGGER articles_updated_at
        BEFORE UPDATE ON articles
        FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS article_tags (
        article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (article_id, tag_id)
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags(tag_id)`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_article_tags_article ON article_tags(article_id)`.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        invited_by UUID NOT NULL REFERENCES profiles(id),
        token TEXT NOT NULL UNIQUE,
        accepted_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token)`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email)`.execute(db);

    await sql`
      CREATE TABLE IF NOT EXISTS mail_settings (
        user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        gmail_address TEXT NOT NULL,
        app_password_encrypted TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      CREATE OR REPLACE TRIGGER mail_settings_updated_at
        BEFORE UPDATE ON mail_settings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `.execute(db);

    // Zelfde zoekfunctie als in supabase/migrations/20260825000000_tag_filter_and.sql.
    await sql`
      CREATE OR REPLACE FUNCTION search_articles(
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
            FROM article_tags at2
            JOIN tags t ON t.id = at2.tag_id
            WHERE at2.article_id = a.id
          ) AS tags,
          ts_rank_cd(a.search_vector, websearch_to_tsquery('dutch', search_query)) AS rank
        FROM articles a
        JOIN profiles p ON p.id = a.author_id
        WHERE
          a.status = ANY(status_filter)
          AND a.search_vector @@ websearch_to_tsquery('dutch', search_query)
          AND (
            tag_slugs IS NULL
            OR (
              SELECT COUNT(DISTINCT t2.slug)
              FROM article_tags at3
              JOIN tags t2 ON t2.id = at3.tag_id
              WHERE at3.article_id = a.id
              AND t2.slug = ANY(tag_slugs)
            ) = cardinality(tag_slugs)
          )
        ORDER BY rank DESC
        LIMIT result_limit
        OFFSET result_offset;
      END;
      $$ LANGUAGE plpgsql STABLE
    `.execute(db);
  },
};
