export type ArticleStatus = "draft" | "in_review" | "published";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface TagWithCount extends Tag {
  article_count: number;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  content_text: string;
  excerpt: string | null;
  cover_image_url: string | null;
  status: ArticleStatus;
  author_id: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ArticleWithRelations extends Article {
  author: Profile;
  reviewer: Profile | null;
  tags: Tag[];
}

export interface ArticleSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  status: ArticleStatus;
  author: Profile;
  tags: Tag[];
  published_at: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  status: ArticleStatus;
  author_name: string;
  published_at: string | null;
  tags: { name: string; slug: string }[] | null;
  rank: number;
}

export interface Invitation {
  id: string;
  email: string;
  invited_by: string;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  totalPages: number;
}
