import { sql } from "kysely";
import type { Migratie } from "../../migrate";

// Basisschema voor SQL Server: dezelfde tabellen als postgres/0001_basis, met
// T-SQL-types (zie de typeregels hieronder). Elke tabel en index staat achter
// een IF-controle, zodat de migratie veilig opnieuw kan draaien; nooit DROP of
// DELETE.
//
// Regels voor alle SQL Server-migraties:
// - één batch per sql`…` (geen GO), geen ${parameter} in DDL;
// - elke tabel in dbo., kolomnamen tussen dubbele aanhalingstekens;
// - id's en foreign keys nvarchar(36) (tedious stuurt elke string als
//   nvarchar; een varchar-kolom zou een impliciete conversie en een index-scan
//   geven), JSON als nvarchar(max) met ISJSON-controle, booleans als bit,
//   tijdstippen als datetime2(3) in UTC (SYSUTCDATETIME);
// - geen triggers: Better Auth schrijft met OUTPUT inserted.* (zonder INTO),
//   wat op een tabel met een trigger faalt (Msg 334). De app zet updated_at zelf;
// - geen id-standaardwaarden: de app maakt elk id zelf aan.
//
// Bewust anders dan Postgres:
// - articles.reviewer_id en password_resets.created_by zijn NO ACTION in plaats
//   van SET NULL: SQL Server weigert meerdere cascadepaden vanuit profiles
//   (Msg 1785). De app verwijdert geen profielen;
// - geen zoekfunctie search_articles; zoeken gebruikt de berekende kolom
//   search_text (full-text in 0005, anders LIKE). Selecteer die kolom nooit;
// - geen aparte indexen op kolommen die al UNIQUE zijn (slug, token).
export const basis: Migratie = {
  naam: "0001_basis",
  transactioneel: true,
  async up(db) {
    await sql`
      IF OBJECT_ID(N'dbo.profiles', N'U') IS NULL
      CREATE TABLE dbo.profiles (
        "id" nvarchar(36) NOT NULL CONSTRAINT PK_profiles PRIMARY KEY,
        "email" nvarchar(320) NOT NULL,
        "display_name" nvarchar(400) NOT NULL,
        "avatar_url" nvarchar(max) NULL,
        "is_admin" bit NOT NULL CONSTRAINT DF_profiles_is_admin DEFAULT 0,
        "theme" nvarchar(10) NOT NULL CONSTRAINT DF_profiles_theme DEFAULT N'system'
          CONSTRAINT CK_profiles_theme CHECK ("theme" IN (N'light', N'dark', N'system')),
        "items_per_page" int NOT NULL CONSTRAINT DF_profiles_items_per_page DEFAULT 20
          CONSTRAINT CK_profiles_items_per_page CHECK ("items_per_page" IN (10, 20, 50, 100)),
        "default_sort" nvarchar(20) NOT NULL CONSTRAINT DF_profiles_default_sort DEFAULT N'updated_at'
          CONSTRAINT CK_profiles_default_sort CHECK ("default_sort" IN (N'updated_at', N'title')),
        "created_at" datetime2(3) NOT NULL CONSTRAINT DF_profiles_created_at DEFAULT SYSUTCDATETIME(),
        "updated_at" datetime2(3) NOT NULL CONSTRAINT DF_profiles_updated_at DEFAULT SYSUTCDATETIME()
      )
    `.execute(db);

    await sql`
      IF OBJECT_ID(N'dbo.tags', N'U') IS NULL
      CREATE TABLE dbo.tags (
        "id" nvarchar(36) NOT NULL CONSTRAINT PK_tags PRIMARY KEY,
        "name" nvarchar(200) NOT NULL CONSTRAINT UQ_tags_name UNIQUE,
        "slug" nvarchar(200) NOT NULL CONSTRAINT UQ_tags_slug UNIQUE,
        "created_at" datetime2(3) NOT NULL CONSTRAINT DF_tags_created_at DEFAULT SYSUTCDATETIME()
      )
    `.execute(db);

    // search_text: zoektekst voor full-text en LIKE. CONTAINS met AND over
    // meerdere kolommen vraagt alle woorden in DEZELFDE kolom, vandaar één
    // samengevoegde kolom. PERSISTED en deterministisch (CONCAT, NCHAR), zodat
    // er een full-text-index op kan.
    await sql`
      IF OBJECT_ID(N'dbo.articles', N'U') IS NULL
      CREATE TABLE dbo.articles (
        "id" nvarchar(36) NOT NULL CONSTRAINT PK_articles PRIMARY KEY,
        "title" nvarchar(1000) NOT NULL,
        "slug" nvarchar(450) NOT NULL CONSTRAINT UQ_articles_slug UNIQUE,
        "content" nvarchar(max) NOT NULL CONSTRAINT DF_articles_content DEFAULT N'{}'
          CONSTRAINT CK_articles_content_json CHECK (ISJSON("content") = 1),
        "content_text" nvarchar(max) NOT NULL CONSTRAINT DF_articles_content_text DEFAULT N'',
        "excerpt" nvarchar(max) NULL,
        "cover_image_url" nvarchar(max) NULL,
        "status" nvarchar(20) NOT NULL CONSTRAINT DF_articles_status DEFAULT N'draft'
          CONSTRAINT CK_articles_status CHECK ("status" IN (N'draft', N'in_review', N'published')),
        "author_id" nvarchar(36) NOT NULL
          CONSTRAINT FK_articles_author REFERENCES dbo.profiles ("id") ON DELETE CASCADE,
        "reviewer_id" nvarchar(36) NULL
          CONSTRAINT FK_articles_reviewer REFERENCES dbo.profiles ("id"),
        "reviewed_at" datetime2(3) NULL,
        "published_at" datetime2(3) NULL,
        "is_pinned" bit NOT NULL CONSTRAINT DF_articles_is_pinned DEFAULT 0,
        "pin_order" int NOT NULL CONSTRAINT DF_articles_pin_order DEFAULT 0,
        "created_at" datetime2(3) NOT NULL CONSTRAINT DF_articles_created_at DEFAULT SYSUTCDATETIME(),
        "updated_at" datetime2(3) NOT NULL CONSTRAINT DF_articles_updated_at DEFAULT SYSUTCDATETIME(),
        "search_text" AS CONCAT("title", NCHAR(10), "excerpt", NCHAR(10), "content_text") PERSISTED
      )
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.articles') AND name = N'idx_articles_status')
      CREATE INDEX idx_articles_status ON dbo.articles ("status")
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.articles') AND name = N'idx_articles_author')
      CREATE INDEX idx_articles_author ON dbo.articles ("author_id")
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.articles') AND name = N'idx_articles_published_at')
      CREATE INDEX idx_articles_published_at ON dbo.articles ("published_at" DESC)
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.articles') AND name = N'idx_articles_pinned')
      CREATE INDEX idx_articles_pinned ON dbo.articles ("is_pinned" DESC, "updated_at" DESC)
    `.execute(db);

    await sql`
      IF OBJECT_ID(N'dbo.article_tags', N'U') IS NULL
      CREATE TABLE dbo.article_tags (
        "article_id" nvarchar(36) NOT NULL
          CONSTRAINT FK_article_tags_article REFERENCES dbo.articles ("id") ON DELETE CASCADE,
        "tag_id" nvarchar(36) NOT NULL
          CONSTRAINT FK_article_tags_tag REFERENCES dbo.tags ("id") ON DELETE CASCADE,
        CONSTRAINT PK_article_tags PRIMARY KEY ("article_id", "tag_id")
      )
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.article_tags') AND name = N'idx_article_tags_tag')
      CREATE INDEX idx_article_tags_tag ON dbo.article_tags ("tag_id")
    `.execute(db);

    await sql`
      IF OBJECT_ID(N'dbo.invitations', N'U') IS NULL
      CREATE TABLE dbo.invitations (
        "id" nvarchar(36) NOT NULL CONSTRAINT PK_invitations PRIMARY KEY,
        "email" nvarchar(320) NOT NULL,
        "invited_by" nvarchar(36) NOT NULL
          CONSTRAINT FK_invitations_invited_by REFERENCES dbo.profiles ("id"),
        "token" nvarchar(128) NOT NULL CONSTRAINT UQ_invitations_token UNIQUE,
        "accepted_at" datetime2(3) NULL,
        "expires_at" datetime2(3) NOT NULL
          CONSTRAINT DF_invitations_expires_at DEFAULT DATEADD(day, 7, SYSUTCDATETIME()),
        "created_at" datetime2(3) NOT NULL CONSTRAINT DF_invitations_created_at DEFAULT SYSUTCDATETIME()
      )
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invitations') AND name = N'idx_invitations_email')
      CREATE INDEX idx_invitations_email ON dbo.invitations ("email")
    `.execute(db);

    await sql`
      IF OBJECT_ID(N'dbo.mail_settings', N'U') IS NULL
      CREATE TABLE dbo.mail_settings (
        "user_id" nvarchar(36) NOT NULL,
        "gmail_address" nvarchar(320) NOT NULL,
        "app_password_encrypted" nvarchar(max) NOT NULL,
        "created_at" datetime2(3) NOT NULL CONSTRAINT DF_mail_settings_created_at DEFAULT SYSUTCDATETIME(),
        "updated_at" datetime2(3) NOT NULL CONSTRAINT DF_mail_settings_updated_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_mail_settings PRIMARY KEY ("user_id"),
        CONSTRAINT FK_mail_settings_user FOREIGN KEY ("user_id") REFERENCES dbo.profiles ("id") ON DELETE CASCADE
      )
    `.execute(db);
  },
};
