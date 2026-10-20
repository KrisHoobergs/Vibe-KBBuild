// Gedeelde types van het zoeken (Postgres en SQL Server). Zonder imports, zodat
// ook de unittests van de SQL Server-tak ze kunnen gebruiken.

export type ZoekParams = {
  query: string;
  /** null: geen tagfilter. Anders moet een artikel ALLE tags hebben (AND). */
  tagSlugs: string[] | null;
  statuses: string[];
  limit: number;
  offset: number;
};

/** Eén rij zoals de database ze teruggeeft, vóór de omzetting naar SearchResult. */
export type ZoekRij = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  status: string;
  author_name: string;
  published_at: Date | null;
  updated_at: Date;
  /** Postgres: jsonb (al een array); SQL Server: FOR JSON-tekst. Leeg: null. */
  tags: unknown;
  rank: number;
};
