# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Knowledge Build" / "Know-How Space": a team knowledge base. Next.js 16 (App Router, React 19), Supabase (Postgres, Auth, Storage), Tiptap v3, shadcn/ui (new-york), Tailwind CSS v4. All UI text, route segments (`artikelen`, `bewerken`, `beheer`, `inloggen`, ...) and most code comments are in **Dutch**. Keep new UI strings and comments in Dutch.

## Commands

```bash
npm run dev          # dev server on http://localhost:3000
npm run build        # production build (what Vercel runs)
npm run lint         # ESLint (flat config, eslint-config-next)
npx tsc --noEmit     # type check
npx shadcn@latest add <component>   # add a shadcn/ui component into src/components/ui
```

There is no test suite. `next build` does not run ESLint in Next 16, so lint errors don't block a deploy. Run `npm run lint` on its own.

Env vars (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `MAIL_ENCRYPTION_KEY`. Local dev uses the **production** Supabase project, so `MAIL_ENCRYPTION_KEY` must be identical in `.env.local` and in Vercel.

## Deployment and database migrations

- Vercel auto-deploys every push to `main` (GitHub: KrisHoobergs/Vibe-KBBuild).
- Migrations live in `supabase/migrations/` with a `YYYYMMDDHHMMSS_` prefix. There is only one Supabase project, and it is production. The Supabase CLI is not linked on this machine. A migration is applied either by hand in the Supabase SQL Editor, or through the Supabase MCP (`.mcp.json`, `apply_migration`), but **only after Kris explicitly approves it**. Always write the file to `supabase/migrations/` as well. If code depends on a new column or function, push it only after the SQL has been applied, or production will break.
- The Supabase MCP URL has no `?project_ref=`, because OAuth login fails with it. Pass project_id `bhghmdfcbwfyzbtvimnt` (KBBuild) explicitly.
- `CREATE OR REPLACE FUNCTION` only works when the arguments and `RETURNS TABLE` stay the same. A signature change needs `DROP FUNCTION` first.

## Architecture

### Route groups (`src/app`)
- `(auth)`: public login, registration, password-reset and invitation pages, in a centered layout.
- `(dashboard)`: the authenticated app. `layout.tsx` checks the JWT locally with `supabase.auth.getClaims()`, loads the `profiles` row and passes it to `DashboardShell` (sidebar, topbar, `ThemeSync`). Only `<main>` scrolls. The topbar always stays visible.
  - A page can put its own buttons in the topbar with `<TopbarActions>` from `src/components/layout/topbar-actions.tsx`, which portals them into a slot. The article page does this. The slot is hidden below `md`, so a page needs its own mobile fallback (see `article-header.tsx`). On the dark topbar, use `topbarButtonClass`.
- `(print)`: a bare layout for `/artikelen/[slug]/afdrukken` (print / save as PDF). It uses the `.print-light` class to force light colors.
- `/` redirects to `/artikelen`. `/api/auth/callback` exchanges the Supabase auth code for a session.

### Auth and authorization
- The root `middleware.ts` calls `updateSession` in `src/lib/supabase/middleware.ts`. That refreshes the session and redirects. Its `protectedPaths` list is hardcoded, so **add any new top-level authenticated route to it**.
- There are three Supabase clients in `src/lib/supabase/`: `server.ts` (cookie-based, for server components and actions), `client.ts` (browser) and `admin.ts` (service role, bypasses RLS). Only `src/actions/mail.ts` uses the admin client, and only for the `mail_settings` table.
- RLS is deliberately permissive: any authenticated user can create, edit and delete any article or tag. The only admin-only areas are invitations (enforced by RLS) and the `is_admin` checks in `src/actions/admin.ts`. A trigger makes the first user who signs up an admin.
- Invitations are rows with a random token. The admin UI copies the `/uitnodiging/<token>` link to the clipboard, and the admin shares it by hand. The app sends no email.

### Data layer
- All data access goes through Server Actions in `src/actions/*.ts`. Server components also call them as plain functions, for example `getArticles` and `getArticleBySlug`. Mutations return `ActionResult<T>` (`{ success, data?, error? }`) and call `revalidatePath`.
- There are no generated Supabase types. Joined relations are cast with `as unknown as ...` and mapped to the hand-written types in `src/types/index.ts`.
- Supabase `.select(...)` strings must be **plain string literals**, not template literals. Otherwise the type-level select parser reports a ParserError during `npm run build`.

### Articles
- An article stores Tiptap JSON in `content` (JSONB) and plain text in `content_text`. `content_text` feeds full-text search and the reading-time estimate. The editor form sends content as a JSON **string** (`content_json`) because Server Action serialization was losing data. The action parses it back.
- Status workflow: `draft` → `in_review` → `published`. Publishing sets `reviewer_id`, `reviewed_at` and `published_at`. Articles can be pinned. `pin_order` holds the drag-and-drop order (dnd-kit).
- The slug comes from the title (`slugify` in `src/lib/utils.ts`). Collisions get a numeric suffix.

### Listing and search (single page: `/artikelen`)
- URL params: `q`, `filterTags` (comma-separated slugs), `tag` (single slug, from tag cards and badges), `status`, `allStatuses`, `page`. The `Suspense` around `ArticleListLoader` is keyed on these, so the skeleton shows on every navigation.
- With `q`: the `search_articles` Postgres RPC. It does Dutch full-text search on a generated, weighted `search_vector` (title A, excerpt B, content C) using `websearch_to_tsquery`. Results are capped at 20 and not paginated.
- Without `q`: `getArticles` queries PostgREST. A tag filter uses **AND** semantics. With one tag, an `!inner` join on an aliased `match:` relation. With several, the `article_ids_with_all_tags` RPC finds the IDs first. Order: pinned first, then `pin_order`, then the user's `default_sort`. Pagination fetches `perPage + 1` rows to compute `hasMore` without a count query.
- `items_per_page`, `default_sort` and `theme` are per-user preferences on `profiles`. `ThemeSync` applies the theme saved in the database over next-themes' local value.

### Tiptap editor: keep two extension lists in sync
- `src/components/editor/extensions/index.ts` (`editorExtensions`): the editor and the in-app read-only `ArticleRenderer`. It includes `Placeholder` and a React NodeView for resizable images.
- `src/components/editor/extensions/server.ts` (`serverExtensions`): used with `generateHTML` by the print page and the email builder. Both run on the server and import `generateHTML` from **`@tiptap/html/server`**. The plain `@tiptap/html` export resolves to a browser-only build depending on export conditions (for example under CommonJS). `serverExtensions` must not import `@tiptap/react`. That is why `resizable-image-server.ts` exists next to `resizable-image.ts`. Code blocks get inline styles here so they render in email clients.
- **When you add or change a node or mark extension, update both lists.** Otherwise `generateHTML` throws or drops that content in print and email.

### Styling
- Tailwind v4 with CSS-first config in `src/app/globals.css`. There is no `tailwind.config`. Theme tokens are CSS variables (primary `#1A4C58` light, `#FCB50D` dark).
- `@tailwindcss/typography` is **not installed** (it broke the Vercel build), so the `prose` classes in the editor do nothing. Article content styling comes from the hand-written `.ProseMirror` rules in `globals.css`. Add new content styles there, and add print overrides under `@media print` / `.print-light`.

### Uploads and email
- Images (5MB max) and videos (50MB max) are uploaded through Server Actions in `src/actions/upload.ts` to the public Supabase Storage buckets `articles` and `avatars`. Limits and accepted MIME types are in `src/lib/constants.ts`.
- The **"Mailen"** button opens `send-article-dialog.tsx` directly. There is no menu and no `mailto:` option. It sends the full article from the user's **own Google account**, so recipients don't need access to the knowledge base. It uses SMTP with a Google app password (`nodemailer`, `smtp.gmail.com:465`).
  - Each user sets this up under Profiel → E-mail (`/profiel?tab=email`). Saving first runs `verify()` against Gmail. Without a saved setup, the dialog links to that tab instead of showing the form.
  - Credentials live in `mail_settings`. RLS is enabled with **no policies**, and grants are revoked from anon and authenticated, so only the service role can read the table.
  - The app password is stored AES-256-GCM encrypted (`src/lib/crypto.ts`, key `MAIL_ENCRYPTION_KEY`). It is never sent to the browser.
  - `src/lib/email/article-email.ts` builds the HTML. It embeds images as CID attachments: only `data:` URIs and our own Supabase Storage URLs are fetched. Images get `width`/`height` capped at 600px, because classic Outlook ignores `max-width`.
- Resend (removed before) needs a verified domain, and the project has none. Gmail per user is the current choice, so don't switch providers without asking.
