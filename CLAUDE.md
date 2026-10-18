# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Knowledge Build" / "Know-How Space": a team knowledge base. Next.js 16 (App Router, React 19), Supabase (Postgres, Auth, Storage), Kysely (data layer), Tiptap v3, shadcn/ui (new-york), Tailwind CSS v4. All UI text, route segments (`artikelen`, `bewerken`, `beheer`, `inloggen`, ...) and most code comments are in **Dutch**. Keep new UI strings and comments in Dutch.

The app is being made **database-independent**: one backend per installation (Supabase, plain PostgreSQL, SQL Server), chosen with server-side env vars, each installation on its own URL. Done: phase 1 (Kysely data layer, live on the Supabase install) and phase 2 (own login with Better Auth, plain PostgreSQL, file storage in the database or a folder, admin reset links). Still to do: SQL Server (phase 3) and self-hosting/Docker (phase 4). Plan: `C:\Users\krish\.claude\plans\je-weet-nu-dat-reactive-mochi.md`.

## Commands

```bash
npm run dev          # dev server on http://localhost:3000
npm run build        # production build (what Vercel runs)
npm run lint         # ESLint (flat config, eslint-config-next)
npx tsc --noEmit     # type check
npx shadcn@latest add <component>   # add a shadcn/ui component into src/components/ui

npm run db:lokaal                    # local Postgres (embedded-postgres, data in .lokale-db/); keeps running
npm run db:lokaal -- import laatste  # load the newest backup into the local database
npm run db:backup                    # READ-ONLY export of production to ../KBBuild-backups/<timestamp>/
npm run db:vergelijk                 # old PostgREST reads (prod, read-only) vs new Kysely reads (local copy)
npm run db:test                      # all repository write paths against the local database
npm run db:migrate                   # migrations for a NON-Supabase install (refuses Supabase)
npm run test:opslag                  # folder storage, upload tickets, own-URL parsing (no DB needed)
```

`next build` does not run ESLint in Next 16, so lint errors don't block a deploy. Run `npm run lint` on its own. There is no UI test suite; `db:test` covers the data layer and only accepts a local database. UI flows of an own-login install can be tested with Playwright MCP against a local second database (see "Testing an own-login install").

Env vars (see `.env.example`): `DB_DIALECT`, `AUTH_DRIVER` (`supabase` | `local`), `STORAGE_DRIVER` (`supabase` | `database` | `filesystem`), `DATABASE_URL` (direct Postgres connection; Vercel: Supabase **transaction pooler**, port 6543), Supabase vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, the last only used by `db:vergelijk`), `NEXT_PUBLIC_SITE_URL`, `MAIL_ENCRYPTION_KEY`; for an own-login install also `SITE_URL`, `BETTER_AUTH_SECRET` (≥32 chars, also signs upload tickets), `REGISTRATIE` (`open` | `uitnodiging`), `STORAGE_DIR`, `DB_AUTO_MIGRATE`. Config is parsed and validated in `src/lib/config.ts` (it rejects impossible combinations, e.g. supabase login + database storage, or folder storage on Vercel); never read backend choices from `NEXT_PUBLIC_*`.

Local dev: `.env.local` points `DATABASE_URL` at the **local copy** (`npm run db:lokaal`), while login still goes through the production Supabase Auth and uploads go to the production Storage buckets. `MAIL_ENCRYPTION_KEY` must be identical in `.env.local` and in Vercel. `PROD_DATABASE_URL` (session pooler, port 5432) is only for `db:backup`. The local database must use a real locale (not `C`): `LC_CTYPE` decides how full-text search splits words.

## Deployment and database migrations

- Vercel auto-deploys every push to `main` (GitHub: KrisHoobergs/Vibe-KBBuild).
- **The production database (project `bhghmdfcbwfyzbtvimnt`) must never be deleted, emptied or schema-changed without Kris's explicit approval for that specific change.** Use the Supabase MCP read-only (`SELECT`). Before a risky deploy: `npm run db:backup` and compare row counts before and after. `src/lib/db/guard.ts` and `migreer()` (`src/lib/db/migrate.ts`) refuse Supabase databases; never weaken those checks.
- Since 2026-10-18 `20261017000000_lock_public_tables.sql` is applied: anon/authenticated have **no** privileges on the public tables or the search functions, so PostgREST returns 401 for them. Only the direct connection (role postgres), the service role and SECURITY DEFINER triggers can reach the data. A rollback to pre-Kysely code would need the GRANT in that file's header.
- Vercel functions run in **arn1** (Stockholm), next to the database (eu-north-1). The Vercel MCP works **without** `teamId` (with it: 403); runtime logs and protected preview URLs are not reachable through it.
- **Second installation** (since 2026-10-18): Vercel project `kennisbank-werk` (`prj_LGH5zlfNA1vHhsRhrEB0HPNcrbo1`, https://kennisbank-werk.vercel.app, region fra1) for Kris and colleagues: own login, `STORAGE_DRIVER=database`, `REGISTRATIE=uitnodiging`, `DB_AUTO_MIGRATE=true`, database **Neon** (project kennisbank-werk, Frankfurt, database `kennisbank` with ICU `nl-NL` collation; pooled URL in Vercel, direct URL as `WERK_DATABASE_URL` in `.env.local`). Both Vercel projects deploy from `main`, so every push updates both installs.
- **`/api/gezondheid`** (public, no secrets) shows per install whether config, database and startup migrations are OK. Use it first when an install misbehaves, since the Vercel logs are not reachable from here.
- Migrations live in `supabase/migrations/` with a `YYYYMMDDHHMMSS_` prefix. There is only one Supabase project, and it is production. The Supabase CLI is not linked on this machine. A migration is applied either by hand in the Supabase SQL Editor, or through the Supabase MCP (`.mcp.json`, `apply_migration`), but **only after Kris explicitly approves it**. Always write the file to `supabase/migrations/` as well. If code depends on a new column or function, push it only after the SQL has been applied, or production will break.
- The Supabase MCP URL has no `?project_ref=`, because OAuth login fails with it. Pass project_id `bhghmdfcbwfyzbtvimnt` (KBBuild) explicitly.
- `CREATE OR REPLACE FUNCTION` only works when the arguments and `RETURNS TABLE` stay the same. A signature change needs `DROP FUNCTION` first.

## Architecture

### Route groups (`src/app`)
- `(auth)`: public login, registration, password-reset and invitation pages, in a centered layout.
- `(dashboard)`: the authenticated app. `layout.tsx` calls `requireUser()` (identity + `profiles` row) and passes the profile to `DashboardShell` (sidebar, topbar, `ThemeSync`). Only `<main>` scrolls. The topbar always stays visible.
  - A page can put its own buttons in the topbar with `<TopbarActions>` from `src/components/layout/topbar-actions.tsx`, which portals them into a slot. The article page does this. The slot is hidden below `md`, so a page needs its own mobile fallback (see `article-header.tsx`). On the dark topbar, use `topbarButtonClass`.
- `(print)`: a bare layout for `/artikelen/[slug]/afdrukken` (print / save as PDF). It uses the `.print-light` class to force light colors.
- `/` redirects to `/artikelen`. `/api/auth/callback` exchanges the Supabase auth code for a session.

### Auth and authorization
- `src/proxy.ts` (Next 16's name for middleware; it **must live in `src/`** because the app dir is `src/app` — the old root `middleware.ts` was never executed) calls `handleProxy` → `updateSession` in `src/lib/supabase/middleware.ts`. That refreshes the session with `getClaims()` and redirects. **Default-deny**: every page needs a login except the paths in `src/lib/auth/paths.ts` (`AUTH_PAGINAS`, `OPEN_PAGINAS`); a new public page must be added there. The matcher skips `/api/`, `_next` and image files (keep the `\\.` escape in the matcher string).
- **RLS no longer protects app queries**: the app connects directly as the database owner. Authorization lives in `src/lib/auth/index.ts`: `getCurrentUser()` (cached per request), `requireUser()` / `requireAdmin()` for pages (redirect), and `NIET_INGELOGD` / `GEEN_BEHEERDER` results for actions. **Every exported function in a `"use server"` file is callable by anyone as a server action, so each one must check `getCurrentUser()` itself** (and `is_admin` for admin functions), also read-only ones.
- The login system is behind `AuthDriver` (`src/lib/auth/types.ts`): `supabaseAuth` (`src/lib/auth/supabase.ts`) or `localAuth` (`src/lib/auth/local.ts`, Better Auth). The only Supabase clients left are `src/lib/supabase/server.ts` (auth + storage, cookie-based) and the proxy client in `middleware.ts`.
- **Own login (Better Auth 1.7)**: options in `src/lib/auth/better-auth-opties.ts` (shared with scripts), instance in `better-auth.ts` (shares `getDb()`, `transaction: true`, tables `auth_users`/`auth_sessions`/`auth_accounts`/`auth_verifications` with camelCase columns, uuid ids from Postgres, `nextCookies()` last). Sign-in/up/out go through server actions calling `auth.api.*`; the HTTP routes in `src/app/api/auth/[...all]/route.ts` only allow `get-session` and `sign-out`. Because `auth.api` calls are not rate limited by Better Auth, `local.ts` limits failed logins itself (per IP+email, IP, email). The proxy only checks the session cookie exists (`getSessionCookie`); pages validate. `SessionRefresher` (rendered last in the dashboard layout) calls `/api/auth/get-session` so sessions get extended. The profile is created in `localAuth.signUp`, with a lazy fallback in `getCurrentUser`; the **oldest `auth_users` row** becomes admin. With `REGISTRATIE=uitnodiging` only the very first account may register without invitation.
- **Password reset** with own login: an admin creates a link in Beheer → Gebruikers (`createPasswordResetLink`, table `password_resets`, 7 days, single use, a new link revokes older ones); `/wachtwoord-herstellen/[token]` sets the password via Better Auth internals (`setPassword` in `local.ts`) and deletes all sessions. With Supabase: unchanged email flow.
- Permissions model: any authenticated user can create, edit and delete any article or tag. Admin-only: invitations and user management (`src/actions/admin.ts`). Supabase: the `handle_new_user` trigger on `auth.users` creates the profile; the first user becomes admin.
- Invitations are rows with a random token (generated by the app). The admin UI copies the `/uitnodiging/<token>` link to the clipboard, and the admin shares it by hand. The app sends no email. The invitation page looks the token up on the server (no login needed).

### Data layer
- Server Actions in `src/actions/*.ts` check auth and call repositories in `src/lib/db/repositories/*.ts` (Kysely). Server components also call the actions as plain functions, for example `getArticles` and `getArticleBySlug`. Mutations return `ActionResult<T>` (`{ success, data?, error? }`), catch DB errors into a Dutch message and call `revalidatePath`.
- `getDb()` (`src/lib/db/index.ts`) is a per-process singleton over a `pg` pool (`src/lib/db/connection.ts`; `attachDatabasePool` on Vercel). Table types: `src/lib/db/schema.ts`; repositories map rows to the hand-written types in `src/types/index.ts`.
- Write repositories so they also work on SQL Server later (helpers in `src/lib/db/dialect.ts`): app-generated ids (`randomUUID`), set `updated_at` in the app, JSON columns written as a **string** and read with `parseJson`, timestamps returned as ISO via `toIso`, unique violations via `isUniqueViolation`, pagination with `.orderBy(..., "id").offset().fetch()` (no `limit`), no `returning()`, multi-step writes in `getDb().transaction()`. **Never `selectAll()` on `articles`** (it would pull the generated `search_vector`).
- Modules used by `scripts/` (`config.ts`, `db/connection.ts`, `db/migrate.ts`, `db/guard.ts`, migrations) must not import `server-only`. Scripts run with `tsx` (`.mts`); those importing repositories use `--conditions=react-server`.
- Migrations for non-Supabase installs: TS modules in `src/lib/db/migrations/<dialect>/` (`0001_basis` = the public tables, `0002_auth` = exactly what Better Auth's `getMigrations` generates, `0003_password_resets`, `0004_files`), run by `migreer()` via `npm run db:migrate` or `DB_AUTO_MIGRATE=true` (`src/instrumentation.ts` → `src/lib/db/auto-migrate.ts`). When Better Auth options change, regenerate/compare with `getMigrations` from `better-auth/db/migration`. The Supabase install keeps `supabase/migrations/` (manual, with approval).

### Testing an own-login install locally
With `npm run db:lokaal` running: create a second database (e.g. `kbbuild_eigen`) on port 54329, run `npm run db:migrate` with env overrides (`DATABASE_URL=…/kbbuild_eigen AUTH_DRIVER=local STORAGE_DRIVER=database BETTER_AUTH_SECRET=… SITE_URL=http://localhost:3001`), then start `npx next dev -p 3001` with the same overrides (stop other `next dev` processes first: they share the `.next/dev` lock). Playwright MCP can only upload files from inside the project (use `.playwright-mcp/`, which is git-ignored).

### Articles
- An article stores Tiptap JSON in `content` (JSONB) and plain text in `content_text`. `content_text` feeds full-text search and the reading-time estimate. The editor form sends content as a JSON **string** (`content_json`) because Server Action serialization was losing data. The action parses it back.
- Status workflow: `draft` → `in_review` → `published`. Publishing sets `reviewer_id`, `reviewed_at` and `published_at`. Articles can be pinned. `pin_order` holds the drag-and-drop order (dnd-kit).
- The slug comes from the title (`slugify` in `src/lib/utils.ts`). Collisions get a numeric suffix.

### Listing and search (single page: `/artikelen`)
- URL params: `q`, `filterTags` (comma-separated slugs), `tag` (single slug, from tag cards and badges), `status`, `allStatuses`, `page`. The `Suspense` around `ArticleListLoader` is keyed on these, so the skeleton shows on every navigation.
- With `q`: the `search_articles` Postgres function, called from `src/lib/db/repositories/search.ts` with **named arguments** (production still has an older 4-argument overload). It does Dutch full-text search on a generated, weighted `search_vector` (title A, excerpt B, content C) using `websearch_to_tsquery`. Results are capped at 20 and not paginated; equal ranks have no fixed order.
- Without `q`: `listArticles` (Kysely). A tag filter uses **AND** semantics via an `id IN (… GROUP BY article_id HAVING COUNT(DISTINCT slug) = n)` subquery; tags for the page come from a second query. Order: pinned first, then `pin_order`, then the user's `default_sort`, then `id`. Pagination fetches `perPage + 1` rows to compute `hasMore` without a count query. Saving an article silently skips tag ids that no longer exist.
- `items_per_page`, `default_sort` and `theme` are per-user preferences on `profiles`. `ThemeSync` applies the theme saved in the database over next-themes' local value.

### Tiptap editor: keep two extension lists in sync
- `src/components/editor/extensions/index.ts` (`editorExtensions`): the editor and the in-app read-only `ArticleRenderer`. It includes `Placeholder` and a React NodeView for resizable images.
- `src/components/editor/extensions/server.ts` (`serverExtensions`): used with `generateHTML` by the print page and the email builder. Both run on the server and import `generateHTML` from **`@tiptap/html/server`**. The plain `@tiptap/html` export resolves to a browser-only build depending on export conditions (for example under CommonJS). `serverExtensions` must not import `@tiptap/react`. That is why `resizable-image-server.ts` exists next to `resizable-image.ts`. Code blocks get inline styles here so they render in email clients.
- **When you add or change a node or mark extension, update both lists.** Otherwise `generateHTML` throws or drops that content in print and email.

### Styling
- Tailwind v4 with CSS-first config in `src/app/globals.css`. There is no `tailwind.config`. Theme tokens are CSS variables (primary `#1A4C58` light, `#FCB50D` dark).
- `@tailwindcss/typography` is **not installed** (it broke the Vercel build), so the `prose` classes in the editor do nothing. Article content styling comes from the hand-written `.ProseMirror` rules in `globals.css`. Add new content styles there, and add print overrides under `@media print` / `.print-light`.

### Uploads and email
- Images (5MB max) and videos (50MB max) go **from the browser straight to storage**: `uploadBestand()` (`src/lib/storage/client-upload.ts`) asks `prepareUpload` (`src/actions/upload.ts`) for a ticket (signed upload URL for the public Supabase buckets `articles` / `avatars`), then uploads with `uploadToSignedUrl`. This avoids the 1MB server-action and 4.5MB Vercel body limits. Avatars are then saved with `finalizeAvatar`. Limits and accepted MIME types are in `src/lib/constants.ts`; the app checks client-declared values, and the buckets enforce the same limits (`file_size_limit` / `allowed_mime_types`, set by `20261017000001_bucket_limits.sql`). Keep both in sync.
- Storage sits behind `StorageDriver` (`src/lib/storage/`): `supabaseStorage`, `databaseStorage` (table `files`, bytea) or `filesystemStorage` (`STORAGE_DIR`, never overwrites). Path rules live in `paden.ts` (`VEILIG_PAD`, `parseEigenBestandUrl` rejects backslashes/control chars). For database/folder storage, `prepareUpload` returns an HMAC-signed **upload ticket** (`ticket.ts`, 15 min, bound to user, path, type, max size) and the browser POSTs to `/api/bestanden/upload`; files are served (login required) by `/api/bestanden/[...pad]` with Range/206 (max 4 MiB per answer) and ETag. Stored URLs are relative (`/api/bestanden/<bucket>/<path>`). On Vercel, uploads to own storage are capped at 4 MB (function body limit).
- The **"Mailen"** button opens `send-article-dialog.tsx` directly. There is no menu and no `mailto:` option. It sends the full article from the user's **own Google account**, so recipients don't need access to the knowledge base. It uses SMTP with a Google app password (`nodemailer`, `smtp.gmail.com:465`).
  - Each user sets this up under Profiel → E-mail (`/profiel?tab=email`). Saving first runs `verify()` against Gmail. Without a saved setup, the dialog links to that tab instead of showing the form.
  - Credentials live in `mail_settings`, read through the direct DB connection (only the user's own row). In Supabase, RLS is enabled with **no policies** and grants are revoked from anon and authenticated.
  - The app password is stored AES-256-GCM encrypted (`src/lib/crypto.ts`, key `MAIL_ENCRYPTION_KEY`). It is never sent to the browser.
  - `src/lib/email/article-email.ts` builds the HTML. It embeds images as CID attachments: only `data:` URIs and files from our own storage (read via the storage driver, 10 s timeout per image). Images get `width`/`height` capped at 600px, because classic Outlook ignores `max-width`. An own-storage image that can't be embedded becomes a short "niet meegestuurd" note with a link (it would need a login).
- Resend (removed before) needs a verified domain, and the project has none. Gmail per user is the current choice, so don't switch providers without asking.
