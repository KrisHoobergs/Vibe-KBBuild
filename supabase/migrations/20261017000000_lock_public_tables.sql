-- =============================================================
-- Publieke REST-toegang tot de tabellen intrekken
--
-- Sinds de database-onafhankelijke datalaag (Kysely, directe verbinding via
-- DATABASE_URL) gebruikt de app PostgREST niet meer voor tabellen. De
-- autorisatie zit in de app (src/lib/auth). Het publieke REST-endpoint met de
-- anon key hoeft de tabellen dus niet meer te kunnen lezen of schrijven.
--
-- Dit sluit onder meer het gat waarmee elke ingelogde gebruiker via
-- PATCH /rest/v1/profiles?id=eq.<eigen id> zijn eigen is_admin op true kon
-- zetten (de policy "Users can update own profile" beperkt geen kolommen).
--
-- ALLEEN TOEPASSEN:
--   1. na de deploy van de nieuwe datalaag (de oude code gebruikte PostgREST),
--   2. met uitdrukkelijk akkoord van Kris.
--
-- Er wordt niets verwijderd: geen tabellen, geen data, geen policies. Alleen
-- rechten van de rollen anon en authenticated. De service role, de directe
-- databaseverbinding (rol postgres) en de trigger handle_new_user (SECURITY
-- DEFINER) blijven werken. Supabase Auth en Storage gebruiken andere schema's.
--
-- Terugdraaien (bv. bij een Vercel-rollback naar de oude code):
--   GRANT SELECT, INSERT, UPDATE, DELETE
--     ON public.profiles, public.articles, public.tags, public.article_tags, public.invitations
--     TO authenticated;
-- =============================================================

REVOKE ALL ON public.profiles     FROM anon, authenticated;
REVOKE ALL ON public.articles     FROM anon, authenticated;
REVOKE ALL ON public.tags         FROM anon, authenticated;
REVOKE ALL ON public.article_tags FROM anon, authenticated;
REVOKE ALL ON public.invitations  FROM anon, authenticated;
-- public.mail_settings: al ingetrokken in 20261014000000_mail_settings.sql.

-- De zoekfuncties zijn via /rest/v1/rpc aanroepbaar; de app roept ze nu
-- rechtstreeks aan.
REVOKE EXECUTE ON FUNCTION public.search_articles(TEXT, TEXT[], TEXT[], INT, INT) FROM anon, authenticated, PUBLIC;
-- Oudere variant met 4 argumenten (bestaat nog in productie).
REVOKE EXECUTE ON FUNCTION public.search_articles(TEXT, TEXT[], INT, INT) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.article_ids_with_all_tags(TEXT[]) FROM anon, authenticated, PUBLIC;
