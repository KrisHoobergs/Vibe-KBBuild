/**
 * Test van de eigen login (Better Auth) op SQL Server, tegen een SQL Server-
 * TESTdatabase (MSSQL_TEST_* in .env.local of de omgeving).
 *
 *   npm run test:login:mssql
 *
 * LET OP: maakt de testdatabase eerst leeg en voert alle migraties opnieuw
 * uit (de test "precies één beheerder" vraagt een lege auth_users). Weigert
 * elke database die niet kb_test…/kennisbank_test… heet of de markering
 * kb_testdatabase mist (scripts/lib/mssql-testomgeving.mts).
 *
 * Better Auth met dezelfde instellingen als de app (betterAuthOpties), zonder
 * nextCookies (dat werkt alleen binnen een Next.js-aanvraag). Het wachtwoord
 * herstellen gaat wel via de echte localAuth.setPassword (src/lib/auth/local.ts).
 */
import assert from "node:assert/strict";
import { sql, type Kysely } from "kysely";
import {
  assertMssqlTestdatabase,
  maakMssqlTestdatabaseLeeg,
  zetMssqlTestomgeving,
} from "./lib/mssql-testomgeving.mjs";

zetMssqlTestomgeving();

const { leesConfig } = await import("../src/lib/config");
const { getDb } = await import("../src/lib/db/index");
const { foutNummers } = await import("../src/lib/db/dialect");
const { voerMigratiesUit } = await import("../src/lib/db/auto-migrate");
const { betterAuthOpties } = await import("../src/lib/auth/better-auth-opties");
const { localAuth } = await import("../src/lib/auth/local");
const profielen = await import("../src/lib/db/repositories/profiles");
const herstel = await import("../src/lib/db/repositories/password-resets");
const { getMigrations } = await import("better-auth/db/migration");
const { betterAuth } = await import("better-auth");
const { isAPIError } = await import("better-auth/api");

const config = leesConfig();
if (config.db.dialect !== "mssql") throw new Error("De testomgeving zette DB_DIALECT=mssql niet");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = getDb() as unknown as Kysely<any>;
const meldingen: string[] = [];
const opties = {
  ...betterAuthOpties(db, { secret: process.env.BETTER_AUTH_SECRET!, baseURL: process.env.SITE_URL!, dialect: "mssql" }),
  logger: {
    level: "warn" as const,
    log: (niveau: string, bericht: string) => {
      if (niveau === "warn" || niveau === "error") meldingen.push(`${niveau}: ${bericht}`);
    },
  },
};
const auth = betterAuth(opties);

const DAG_MS = 24 * 60 * 60 * 1000;
const BROWSER = { "user-agent": "test-login-mssql/1.0", "x-forwarded-for": "10.0.0.7" };

let geslaagd = 0;
async function stap(naam: string, fn: () => Promise<void>) {
  try {
    await fn();
    geslaagd++;
    console.log(`✓ ${naam}`);
  } catch (err) {
    console.error(`✗ ${naam}`);
    throw err;
  }
}

/** Alle cookies uit een antwoord van Better Auth, als Cookie-header. */
function cookieUit(headers: Headers): string {
  const cookies = headers.getSetCookie().map((c) => c.split(";")[0]);
  assert.ok(cookies.some((c) => c.startsWith("better-auth.session_token=")), "geen sessiecookie");
  return cookies.join("; ");
}

async function registreer(email: string, password: string, name: string) {
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers(BROWSER),
    returnHeaders: true,
  });
  return { user: response.user, cookie: cookieUit(headers) };
}

async function inloggen(email: string, password: string) {
  const { headers, response } = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(BROWSER),
    returnHeaders: true,
  });
  return { user: response.user, cookie: cookieUit(headers) };
}

/** De code van een APIError van Better Auth (of de fout zelf als het geen APIError is). */
async function apiFout(belofte: Promise<unknown>): Promise<string> {
  try {
    await belofte;
  } catch (err) {
    if (isAPIError(err)) return String(err.body?.code ?? err.status);
    throw err;
  }
  assert.fail("had moeten mislukken");
}

try {
  await stap("testdatabase gecontroleerd, leeggemaakt en opnieuw gemigreerd", async () => {
    await assertMssqlTestdatabase(db);
    await maakMssqlTestdatabaseLeeg(db);
    const uitgevoerd = await voerMigratiesUit(() => {});
    assert.ok(uitgevoerd.includes("0002_auth"), uitgevoerd.join(", "));
  });

  await stap("Better Auth: getMigrations meldt niets te maken of toe te voegen", async () => {
    const m = await getMigrations(opties);
    assert.deepEqual(m.toBeCreated, []);
    assert.deepEqual(m.toBeAdded, []);
    assert.deepEqual(meldingen, [], "Better Auth gaf waarschuwingen (bv. een ander kolomtype)");
  });

  let beheerderId = "";
  await stap("twee registraties tegelijk + profielen: precies één beheerder (het oudste account)", async () => {
    const [a, b] = await Promise.all([
      registreer("tegelijk-a@voorbeeld.be", "wachtwoord-a", "Tegelijk A"),
      registreer("tegelijk-b@voorbeeld.be", "wachtwoord-b", "Tegelijk B"),
    ]);
    // Zoals localAuth.signUp: daarna het profiel. Twee keer tegelijk voor
    // hetzelfde account mag ook (de tweede doet niets).
    await Promise.all([
      profielen.createProfileForUser({ id: a.user.id, email: a.user.email, displayName: "Tegelijk A" }),
      profielen.createProfileForUser({ id: b.user.id, email: b.user.email, displayName: "Tegelijk B" }),
      profielen.createProfileForUser({ id: a.user.id, email: a.user.email, displayName: "Tegelijk A" }),
    ]);
    const { rows } = await sql<{ id: string; is_admin: boolean }>`
      SELECT p."id", p."is_admin" FROM dbo.profiles AS p ORDER BY p."id"
    `.execute(db);
    assert.equal(rows.length, 2);
    const beheerders = rows.filter((r) => r.is_admin);
    assert.equal(beheerders.length, 1, JSON.stringify(rows));
    const { rows: oudste } = await sql<{ id: string }>`
      SELECT "id" FROM dbo.auth_users ORDER BY "createdAt", "id" OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
    `.execute(db);
    assert.equal(beheerders[0].id, oudste[0]?.id);
    beheerderId = beheerders[0].id;
  });

  let eerste = { id: "", cookie: "" };
  await stap("registreren: e-mail in kleine letters, Unicode-naam, createdAt in UTC", async () => {
    const naam = "Łukasz Żółć 🎉";
    const { user, cookie } = await registreer("Eerste@Voorbeeld.be", "geheim-123", naam);
    assert.equal(user.email, "eerste@voorbeeld.be");
    eerste = { id: user.id, cookie };
    await profielen.createProfileForUser({ id: user.id, email: user.email, displayName: naam });
    const { rows } = await sql<{ email: string; name: string; verschil_ms: number; emailVerified: boolean }>`
      SELECT "email", "name", "emailVerified",
             DATEDIFF(millisecond, "createdAt", SYSUTCDATETIME()) AS verschil_ms
      FROM dbo.auth_users WHERE "id" = ${user.id}
    `.execute(db);
    assert.equal(rows[0]?.email, "eerste@voorbeeld.be");
    assert.equal(rows[0]?.name, naam);
    assert.equal(rows[0]?.emailVerified, false);
    // Een tijdzonefout zou uren schelen; klokverschil met de server telt mee.
    assert.ok(Math.abs(rows[0]!.verschil_ms) < 5_000, `createdAt wijkt ${rows[0]!.verschil_ms} ms af van SYSUTCDATETIME()`);
    const profiel = await profielen.getProfileById(user.id);
    assert.equal(profiel?.display_name, naam);
    assert.equal(profiel?.is_admin, false);
  });

  await stap("sessie: geldig, verloopt over 30 dagen (UTC)", async () => {
    const sessie = await auth.api.getSession({ headers: new Headers({ ...BROWSER, cookie: eerste.cookie }) });
    assert.equal(sessie?.user.id, eerste.id);
    assert.equal(sessie?.user.email, "eerste@voorbeeld.be");
    const verloopt = new Date(sessie!.session.expiresAt).getTime();
    assert.ok(Math.abs(verloopt - (Date.now() + 30 * DAG_MS)) < 60_000, `expiresAt ${new Date(verloopt).toISOString()}`);
    const { rows } = await sql<{ seconden: number }>`
      SELECT DATEDIFF(second, SYSUTCDATETIME(), "expiresAt") AS seconden
      FROM dbo.auth_sessions WHERE "userId" = ${eerste.id}
    `.execute(db);
    assert.equal(rows.length, 1);
    assert.ok(Math.abs(rows[0].seconden - 30 * 24 * 3600) < 60, `${rows[0].seconden} s`);
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: "better-auth.session_token=bestaat.niet" }) }), null);
  });

  await stap("inloggen: verkeerd wachtwoord geweigerd, juist wachtwoord (andere hoofdletters) lukt", async () => {
    assert.match(await apiFout(auth.api.signInEmail({ body: { email: "eerste@voorbeeld.be", password: "fout-wachtwoord" } })), /INVALID/);
    assert.match(await apiFout(auth.api.signInEmail({ body: { email: "niemand@voorbeeld.be", password: "geheim-123" } })), /INVALID/);
    const { user, cookie } = await inloggen("EERSTE@voorbeeld.be", "geheim-123");
    assert.equal(user.id, eerste.id);
    assert.equal((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id, eerste.id);
    const { rows } = await sql<{ aantal: number }>`
      SELECT COUNT(*) AS aantal FROM dbo.auth_sessions WHERE "userId" = ${eerste.id}
    `.execute(db);
    assert.equal(rows[0]?.aantal, 2);
  });

  await stap("hetzelfde adres met andere hoofdletters opnieuw registreren: geweigerd", async () => {
    assert.match(
      await apiFout(auth.api.signUpEmail({ body: { email: "EERSTE@voorbeeld.BE", password: "ander-123", name: "Dubbel" } })),
      /USER_ALREADY_EXISTS/
    );
    const { rows } = await sql<{ aantal: number }>`SELECT COUNT(*) AS aantal FROM dbo.auth_users`.execute(db);
    assert.equal(rows[0]?.aantal, 3);
  });

  await stap("herstellink + localAuth.setPassword: oude sessies weg, nieuw wachtwoord werkt", async () => {
    const { token } = await herstel.insertPasswordReset(eerste.id, beheerderId);
    assert.deepEqual(await herstel.getValidPasswordReset(token), { userId: eerste.id, email: "eerste@voorbeeld.be" });
    assert.equal(await herstel.markPasswordResetUsed(token), true);
    assert.equal(await herstel.markPasswordResetUsed(token), false, "een link werkt maar één keer");

    assert.deepEqual(await localAuth.setPassword!(eerste.id, "kort"), {
      success: false,
      error: "Wachtwoord moet minstens 6 tekens bevatten",
    });
    assert.deepEqual(await localAuth.setPassword!(eerste.id, "nieuw-wachtwoord-456"), { success: true });

    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: eerste.cookie }) }), null, "oude sessie nog geldig");
    const { rows } = await sql<{ aantal: number }>`
      SELECT COUNT(*) AS aantal FROM dbo.auth_sessions WHERE "userId" = ${eerste.id}
    `.execute(db);
    assert.equal(rows[0]?.aantal, 0);
    assert.match(await apiFout(auth.api.signInEmail({ body: { email: "eerste@voorbeeld.be", password: "geheim-123" } })), /INVALID/);
    const { user } = await inloggen("eerste@voorbeeld.be", "nieuw-wachtwoord-456");
    assert.equal(user.id, eerste.id);
  });

  await stap("uitloggen: de sessie is weg", async () => {
    const { cookie } = await inloggen("tegelijk-b@voorbeeld.be", "wachtwoord-b");
    assert.ok(await auth.api.getSession({ headers: new Headers({ cookie }) }));
    await auth.api.signOut({ headers: new Headers({ cookie }) });
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
  });

  await stap("account verwijderen: sessies, accounts en profiel gaan mee (cascade)", async () => {
    const { user } = await registreer("weg@voorbeeld.be", "wachtwoord-weg", "Weg");
    await profielen.createProfileForUser({ id: user.id, email: user.email, displayName: "Weg" });
    await db.deleteFrom("auth_users").where("id", "=", user.id).execute();
    const { rows } = await sql<{ sessies: number; accounts: number; profielen: number }>`
      SELECT (SELECT COUNT(*) FROM dbo.auth_sessions WHERE "userId" = ${user.id}) AS sessies,
             (SELECT COUNT(*) FROM dbo.auth_accounts WHERE "userId" = ${user.id}) AS accounts,
             (SELECT COUNT(*) FROM dbo.profiles WHERE "id" = ${user.id}) AS profielen
    `.execute(db);
    assert.deepEqual(rows[0], { sessies: 0, accounts: 0, profielen: 0 });
  });

  // Verwacht: de waarschuwingen bij de opzettelijk mislukte inlogpogingen.
  const onverwacht = meldingen.filter((m) => !/^warn: (Invalid password|User not found)$/.test(m));
  assert.deepEqual(onverwacht, [], "Better Auth gaf onverwachte waarschuwingen of fouten");
  console.log(`\nAlle ${geslaagd} stappen geslaagd.`);
} catch (err) {
  // Geen serveradres of gebruiker tonen: een verbindingsfout van tedious
  // (ESOCKET, ELOGIN, ETIMEOUT, …) alleen met haar code.
  const fouten = Array.isArray(err) ? err : [err];
  for (const f of fouten) {
    const e = f as { code?: unknown; number?: unknown; message?: unknown; stack?: unknown };
    if (typeof e?.code === "string" && /^E[A-Z]+$/.test(e.code) && e.code !== "EREQUEST") {
      console.error(`Verbindingsfout: ${e.code}`);
    } else {
      console.error(e?.stack ?? e?.message ?? f);
      if (foutNummers(f).length) console.error(`  (SQL Server-fout nr ${foutNummers(f).join(", ")})`);
    }
  }
  if (meldingen.length) console.error(meldingen.join("\n"));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
