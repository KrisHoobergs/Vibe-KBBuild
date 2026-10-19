/**
 * De gedeelde stappen van de datalaagtest: alle schrijfacties van de
 * repositories, met controle van de toestand erna. Gebruikt door
 *
 *   scripts/test-datalaag.mts        (npm run db:test, lokale Postgres)
 *   scripts/test-datalaag-mssql.mts  (npm run db:test:mssql, SQL Server-testdatabase)
 *
 * Pas importeren NA het instellen van de omgeving (DATABASE_URL, DB_DIALECT,
 * …): getConfig en getDb lezen die één keer. Alles wat de stappen aanmaken,
 * ruimt opruimen() weer op.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Kysely } from "kysely";
import { getDb } from "../../src/lib/db/index";
import * as artikelen from "../../src/lib/db/repositories/articles";
import * as tags from "../../src/lib/db/repositories/tags";
import * as profielen from "../../src/lib/db/repositories/profiles";
import * as uitnodigingen from "../../src/lib/db/repositories/invitations";
import * as mail from "../../src/lib/db/repositories/mail-settings";
import * as zoeken from "../../src/lib/db/repositories/search";

export type DatalaagOpties = {
  /**
   * Eigen login: profiles.id verwijst naar auth_users (SQL Server). Dan krijgen
   * de testprofielen eerst een auth_users-rij; opruimen() verwijdert die weer.
   */
  heeftAuthUsers: boolean;
  /** Wacht tot de zoekindex bij is (SQL Server full-text). Postgres: meteen klaar. */
  wachtOpZoekindex: () => Promise<unknown>;
  /** De duur achter elke geslaagde stap (db:test:mssql). db:test toont ze niet. */
  toonDuur?: boolean;
};

/**
 * Herhaalt `vraag` tot `klaar` waar is (hooguit maxMs), en geeft het laatste
 * antwoord terug. Is het eerste antwoord meteen goed (Postgres), dan blijft
 * het bij één aanroep.
 */
export async function wachtTot<T>(vraag: () => Promise<T>, klaar: (t: T) => boolean, maxMs = 30_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const antwoord = await vraag();
    if (klaar(antwoord) || Date.now() - start > maxMs) return antwoord;
    await new Promise((r) => setTimeout(r, 250));
  }
}

export function maakDatalaagTest(opties: DatalaagOpties) {
  const db = getDb();
  const PREFIX = `zz-test-${Date.now()}`;
  let geslaagd = 0;

  async function stap(naam: string, fn: () => Promise<void>) {
    const start = performance.now();
    try {
      await fn();
      geslaagd++;
      console.log(`✓ ${naam}${opties.toonDuur ? ` (${Math.round(performance.now() - start)} ms)` : ""}`);
    } catch (err) {
      console.error(`✗ ${naam}`);
      throw err;
    }
  }

  // Een testgebruiker, rechtstreeks in profiles (de echte login zit bij Supabase).
  const auteurId = randomUUID();
  const tweedeId = randomUUID();

  async function opruimen() {
    await db.deleteFrom("articles").where("title", "like", `${PREFIX}%`).execute();
    await db.deleteFrom("tags").where("name", "like", `${PREFIX}%`).execute();
    await db.deleteFrom("invitations").where("email", "like", `${PREFIX}%`).execute();
    await db.deleteFrom("mail_settings").where("user_id", "in", [auteurId, tweedeId]).execute();
    await db.deleteFrom("profiles").where("id", "in", [auteurId, tweedeId]).execute();
    if (opties.heeftAuthUsers) {
      await db.deleteFrom("auth_users").where("id", "in", [auteurId, tweedeId]).execute();
    }
  }

  async function gedeeldeStappen() {
    await stap("testprofielen aanmaken", async () => {
      for (const [id, naam] of [[auteurId, "auteur"], [tweedeId, "reviewer"]]) {
        if (opties.heeftAuthUsers) {
          // auth_users heeft in schema.ts maar een paar kolommen (de app leest er
          // alleen uit); hier schrijft de test zelf, zoals Better Auth.
          await (db as unknown as Kysely<Record<string, Record<string, unknown>>>)
            .insertInto("auth_users")
            .values({
              id,
              name: `${PREFIX} ${naam}`,
              email: `${PREFIX}-${naam}@voorbeeld.be`,
              emailVerified: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .execute();
        }
        await db
          .insertInto("profiles")
          .values({ id, email: `${PREFIX}-${naam}@voorbeeld.be`, display_name: `${PREFIX} ${naam}`, avatar_url: null, created_at: new Date(), updated_at: new Date() })
          .execute();
      }
      const p = await profielen.getProfileById(auteurId);
      assert.equal(p?.is_admin, false);
      assert.equal(p?.theme, "system");
      assert.equal(p?.items_per_page, 20);
    });

    let tagA = "", tagB = "";
    await stap("tags aanmaken, dubbele tag geweigerd", async () => {
      const a = await tags.insertTag(`${PREFIX} Alfa`, `${PREFIX}-alfa`);
      const b = await tags.insertTag(`${PREFIX} Beta`, `${PREFIX}-beta`);
      assert.ok(a.ok && b.ok);
      tagA = a.ok ? a.tag.id : "";
      tagB = b.ok ? b.tag.id : "";
      const dubbel = await tags.insertTag(`${PREFIX} Alfa`, `${PREFIX}-alfa`);
      assert.deepEqual(dubbel, { ok: false, reden: "bestaat" });
    });

    let artikelId = "", slug = "";
    await stap("artikel aanmaken met tags (incl. niet-bestaande en ongeldige tag-id)", async () => {
      const art = await artikelen.insertArticle(
        {
          title: `${PREFIX} Mijn artikel`,
          excerpt: "Korte samenvatting",
          content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hallo ‘wereld’ é 🎉" }] }] },
          content_text: "Hallo wereld installatie handleiding",
          cover_image_url: null,
          tag_ids: [tagA, tagB, tagA, randomUUID(), "geen-uuid"],
        },
        auteurId
      );
      artikelId = art.id;
      slug = art.slug;
      assert.equal(art.status, "draft");
      assert.equal(art.author_id, auteurId);
      assert.match(art.slug, new RegExp(`^${PREFIX}-mijn-artikel$`));
      assert.deepEqual(art.content, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hallo ‘wereld’ é 🎉" }] }] });
      const metRel = await artikelen.getArticleWithRelations(slug);
      assert.deepEqual(metRel?.tags.map((t) => t.id).sort(), [tagA, tagB].sort());
      assert.equal(metRel?.author.id, auteurId);
      assert.equal(metRel?.reviewer, null);
    });

    await stap("tweede artikel met dezelfde titel krijgt een unieke slug", async () => {
      const twee = await artikelen.insertArticle(
        { title: `${PREFIX} Mijn artikel`, excerpt: null, content: {}, content_text: "", cover_image_url: null, tag_ids: [] },
        auteurId
      );
      const drie = await artikelen.insertArticle(
        { title: `${PREFIX} Mijn artikel`, excerpt: null, content: {}, content_text: "", cover_image_url: null, tag_ids: [] },
        auteurId
      );
      assert.equal(twee.slug, `${slug}-1`);
      assert.equal(drie.slug, `${slug}-2`);
    });

    await stap("gelijktijdig aanmaken met dezelfde titel: allemaal unieke slugs", async () => {
      const resultaten = await Promise.all(
        Array.from({ length: 5 }, () =>
          artikelen.insertArticle(
            { title: `${PREFIX} Gelijktijdig`, excerpt: null, content: {}, content_text: "", cover_image_url: null, tag_ids: [] },
            auteurId
          )
        )
      );
      assert.equal(new Set(resultaten.map((r) => r.slug)).size, 5);
    });

    await stap("artikel bijwerken: velden, tags vervangen, updated_at schuift op", async () => {
      const voor = await artikelen.getArticleWithRelations(slug);
      await new Promise((r) => setTimeout(r, 20));
      const na = await artikelen.updateArticleById(
        artikelId,
        { title: `${PREFIX} Nieuwe titel`, excerpt: null, content: { type: "doc", content: [] }, content_text: "nieuw" },
        [tagB]
      );
      assert.ok(na);
      assert.equal(na.title, `${PREFIX} Nieuwe titel`);
      assert.equal(na.slug, slug, "slug blijft gelijk bij een nieuwe titel");
      assert.equal(na.excerpt, null);
      assert.deepEqual(na.content, { type: "doc", content: [] });
      assert.ok(new Date(na.updated_at) > new Date(voor!.updated_at));
      const metRel = await artikelen.getArticleWithRelations(slug);
      assert.deepEqual(metRel?.tags.map((t) => t.id), [tagB]);
    });

    await stap("bijwerken zonder tag_ids laat de tags staan; onbekend id geeft null", async () => {
      await artikelen.updateArticleById(artikelId, { content_text: "nogmaals" });
      const metRel = await artikelen.getArticleWithRelations(slug);
      assert.deepEqual(metRel?.tags.map((t) => t.id), [tagB]);
      assert.equal(await artikelen.updateArticleById(randomUUID(), { title: "x" }), null);
    });

    await stap("status: ter beoordeling, publiceren (met reviewer), terug naar concept", async () => {
      assert.equal(await artikelen.setArticleStatus(artikelId, "in_review"), true);
      let a = await artikelen.getArticleWithRelations(slug);
      assert.equal(a?.status, "in_review");
      assert.equal(a?.published_at, null);

      assert.equal(await artikelen.setArticleStatus(artikelId, "published", tweedeId), true);
      a = await artikelen.getArticleWithRelations(slug);
      assert.equal(a?.status, "published");
      assert.equal(a?.reviewer?.id, tweedeId);
      assert.ok(a?.published_at && a.reviewed_at);

      assert.equal(await artikelen.setArticleStatus(artikelId, "draft"), true);
      a = await artikelen.getArticleWithRelations(slug);
      assert.equal(a?.status, "draft");
      assert.equal(a?.reviewer, null);
      assert.equal(a?.published_at, null);
      assert.equal(a?.reviewed_at, null);

      assert.equal(await artikelen.setArticleStatus(randomUUID(), "draft"), false);
    });

    await stap("pinnen: achteraan de gepinde lijst, herordenen, losmaken", async () => {
      const maxVoor = await db
        .selectFrom("articles")
        .select((eb) => eb.fn.max("pin_order").as("m"))
        .where("is_pinned", "=", true)
        .executeTakeFirst();
      assert.equal(await artikelen.togglePin(artikelId), true);
      let rij = await db.selectFrom("articles").select(["is_pinned", "pin_order"]).where("id", "=", artikelId).executeTakeFirstOrThrow();
      assert.equal(rij.is_pinned, true);
      assert.equal(rij.pin_order, maxVoor?.m == null ? 0 : Number(maxVoor.m) + 1);

      // Herordenen alleen met eigen testartikels: echte gepinde artikels
      // aanraken zou hun updated_at (trigger) veranderen.
      const tweede = await artikelen.insertArticle(
        { title: `${PREFIX} Gepind twee`, excerpt: null, content: {}, content_text: "", cover_image_url: null, tag_ids: [] },
        auteurId
      );
      assert.equal(await artikelen.togglePin(tweede.id), true);
      await artikelen.reorderPinned([tweede.id, artikelId]);
      const naHerordenen = (
        await db.selectFrom("articles").select(["id", "pin_order"]).where("id", "in", [artikelId, tweede.id]).execute()
      ).sort((x, y) => x.pin_order - y.pin_order).map((r) => r.id);
      assert.deepEqual(naHerordenen, [tweede.id, artikelId]);
      await artikelen.deleteArticleById(tweede.id);

      assert.equal(await artikelen.togglePin(artikelId), true);
      rij = await db.selectFrom("articles").select(["is_pinned", "pin_order"]).where("id", "=", artikelId).executeTakeFirstOrThrow();
      assert.equal(rij.is_pinned, false);
      assert.equal(rij.pin_order, 0);
      assert.equal(await artikelen.togglePin(randomUUID()), false);
    });

    await stap("lijst met tagfilter (AND) en zoeken vinden het testartikel", async () => {
      await artikelen.updateArticleById(artikelId, {}, [tagA, tagB]);
      await artikelen.setArticleStatus(artikelId, "published", tweedeId);
      const lijst = await artikelen.listArticles({ page: 1, perPage: 100, sort: "title", tagSlugs: [`${PREFIX}-alfa`, `${PREFIX}-beta`] });
      assert.deepEqual(lijst.data.map((a) => a.id), [artikelId]);
      const geen = await artikelen.listArticles({ page: 1, perPage: 100, sort: "title", tagSlugs: [`${PREFIX}-alfa`, "bestaat-niet"] });
      assert.equal(geen.data.length, 0);
      // SQL Server met full-text: de index werkt asynchroon bij.
      await opties.wachtOpZoekindex();
      const res = await wachtTot(
        () => zoeken.searchArticlesInDb({ query: "nogmaals", tagSlugs: [`${PREFIX}-alfa`], statuses: ["published"], limit: 20, offset: 0 }),
        (r) => r.length > 0
      );
      assert.deepEqual(res.map((r) => r.id), [artikelId]);
    });

    await stap("tags met aantallen; tag verwijderen ontkoppelt hem (cascade)", async () => {
      const met = await tags.listTagsWithCounts();
      assert.equal(met.find((t) => t.id === tagA)?.article_count, 1);
      await tags.deleteTagById(tagA);
      const metRel = await artikelen.getArticleWithRelations(slug);
      assert.deepEqual(metRel?.tags.map((t) => t.id), [tagB]);
      assert.equal(await tags.getTagBySlugFromDb(`${PREFIX}-alfa`), null);
    });

    await stap("artikel verwijderen verwijdert ook de tag-koppelingen", async () => {
      await artikelen.deleteArticleById(artikelId);
      assert.equal(await artikelen.getArticleWithRelations(slug), null);
      const koppelingen = await db.selectFrom("article_tags").select("tag_id").where("article_id", "=", artikelId).execute();
      assert.equal(koppelingen.length, 0);
    });

    await stap("uitnodiging: aanmaken, geldig, dubbel, aanvaarden, intrekken", async () => {
      const email = `${PREFIX}-nieuw@voorbeeld.be`;
      const inv = await uitnodigingen.insertInvitation(email, auteurId);
      assert.equal(inv.token.length, 64);
      assert.ok(new Date(inv.expires_at).getTime() - Date.now() > 6.9 * 24 * 3600 * 1000);
      assert.equal(await uitnodigingen.hasActiveInvitationFor(email), true);
      assert.equal((await uitnodigingen.getValidInvitation(inv.token))?.id, inv.id);
      assert.equal(await uitnodigingen.getValidInvitation("onzin"), null);

      await uitnodigingen.markInvitationAccepted(inv.token);
      assert.equal(await uitnodigingen.getValidInvitation(inv.token), null, "gebruikte uitnodiging is niet meer geldig");
      assert.equal(await uitnodigingen.hasActiveInvitationFor(email), false);

      const tweede = await uitnodigingen.insertInvitation(`${PREFIX}-ander@voorbeeld.be`, auteurId);
      assert.ok((await uitnodigingen.listInvitations()).some((i) => i.id === tweede.id));
      await uitnodigingen.deleteInvitationById(tweede.id);
      assert.ok(!(await uitnodigingen.listInvitations()).some((i) => i.id === tweede.id));
    });

    await stap("profiel: naam, avatar en voorkeuren bijwerken", async () => {
      await profielen.updateProfileFields(auteurId, {
        display_name: `${PREFIX} Nieuwe naam`,
        avatar_url: "https://voorbeeld.be/a.png",
        theme: "dark",
        items_per_page: 50,
        default_sort: "title",
      });
      const p = await profielen.getProfileById(auteurId);
      assert.equal(p?.display_name, `${PREFIX} Nieuwe naam`);
      assert.equal(p?.avatar_url, "https://voorbeeld.be/a.png");
      assert.equal(p?.theme, "dark");
      assert.equal(p?.items_per_page, 50);
      assert.equal(p?.default_sort, "title");
      assert.equal(await profielen.profileExistsWithEmail(`${PREFIX}-auteur@voorbeeld.be`), true);
    });

    await stap("mailinstellingen: toevoegen, bijwerken (upsert), verwijderen", async () => {
      assert.equal(await mail.getMailSettingsRow(auteurId), null);
      await mail.upsertMailSettings(auteurId, "a@gmail.com", "v1:x:y:z");
      assert.deepEqual(await mail.getMailSettingsRow(auteurId), { gmail_address: "a@gmail.com", app_password_encrypted: "v1:x:y:z" });
      await mail.upsertMailSettings(auteurId, "b@gmail.com", "v1:a:b:c");
      assert.deepEqual(await mail.getMailSettingsRow(auteurId), { gmail_address: "b@gmail.com", app_password_encrypted: "v1:a:b:c" });
      await mail.deleteMailSettingsRow(auteurId);
      assert.equal(await mail.getMailSettingsRow(auteurId), null);
    });
  }

  return {
    db,
    PREFIX,
    auteurId,
    tweedeId,
    stap,
    opruimen,
    gedeeldeStappen,
    get geslaagd() {
      return geslaagd;
    },
  };
}
