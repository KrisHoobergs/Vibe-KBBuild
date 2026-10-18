import type { ColumnType, Generated } from "kysely";

// Tabellen zoals de app ze gebruikt, voor alle databases. Kolommen die alleen
// in Postgres bestaan (zoals de gegenereerde search_vector) staan hier bewust
// niet in: de app selecteert ze nooit.

/** Lezen geeft een Date; schrijven mag een Date of ISO-string zijn. */
type Tijdstip = ColumnType<Date, Date | string | undefined, Date | string>;
type OptioneelTijdstip = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;

/** JSON: Postgres geeft een object terug, SQL Server een string. Schrijven altijd als string. */
type Json = ColumnType<unknown, string, string>;

export interface ProfilesTable {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: Generated<boolean>;
  theme: Generated<string>;
  items_per_page: Generated<number>;
  default_sort: Generated<string>;
  created_at: Tijdstip;
  updated_at: Tijdstip;
}

export interface TagsTable {
  id: string;
  name: string;
  slug: string;
  created_at: Tijdstip;
}

export interface ArticlesTable {
  id: string;
  title: string;
  slug: string;
  content: Json;
  content_text: string;
  excerpt: string | null;
  cover_image_url: string | null;
  status: string;
  author_id: string;
  reviewer_id: string | null;
  reviewed_at: OptioneelTijdstip;
  published_at: OptioneelTijdstip;
  is_pinned: Generated<boolean>;
  pin_order: Generated<number>;
  created_at: Tijdstip;
  updated_at: Tijdstip;
}

export interface ArticleTagsTable {
  article_id: string;
  tag_id: string;
}

export interface InvitationsTable {
  id: string;
  email: string;
  invited_by: string;
  token: string;
  accepted_at: OptioneelTijdstip;
  expires_at: Tijdstip;
  created_at: Tijdstip;
}

export interface MailSettingsTable {
  user_id: string;
  gmail_address: string;
  app_password_encrypted: string;
  created_at: Tijdstip;
  updated_at: Tijdstip;
}

/** Herstellinks die een beheerder maakt (alleen bij de eigen login). */
export interface PasswordResetsTable {
  id: string;
  user_id: string;
  token: string;
  created_by: string | null;
  expires_at: Tijdstip;
  used_at: OptioneelTijdstip;
  created_at: Tijdstip;
}

/** Bestanden bij STORAGE_DRIVER=database. */
export interface FilesTable {
  bucket: string;
  path: string;
  content_type: string;
  size: number;
  data: Buffer;
  created_by: string | null;
  created_at: Tijdstip;
}

/**
 * Accounts van de eigen login (Better Auth beheert deze tabel). De app leest
 * er alleen uit, om de eerste gebruiker te bepalen. Kolomnamen in camelCase.
 */
export interface AuthUsersTable {
  id: string;
  email: string;
  createdAt: Tijdstip;
}

export interface Database {
  auth_users: AuthUsersTable;
  profiles: ProfilesTable;
  tags: TagsTable;
  articles: ArticlesTable;
  article_tags: ArticleTagsTable;
  invitations: InvitationsTable;
  mail_settings: MailSettingsTable;
  password_resets: PasswordResetsTable;
  files: FilesTable;
}
