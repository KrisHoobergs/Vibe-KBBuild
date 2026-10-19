// Unittests voor veiligeFoutmelding (npm run test:unit). De Postgres-fixtures
// zijn geschreven tegen de functie van vóór SQL Server (main cb9213d) en moeten
// exact gelijk blijven: zo blijven de meldingen op /status van beide live
// installaties (Supabase en Neon) ongewijzigd. De foutvormen zijn nagemaakt
// van echte pg-fouten (DatabaseError heet "error"; ECONNREFUSED op localhost
// is een AggregateError met code en zonder tekst, Node probeert ::1 én 127.0.0.1).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigFout } from "../config";
import { veiligeFoutmelding } from "./opstartstatus";

/** Een pg-DatabaseError: name "error", code is de SQLSTATE. */
const pgFout = (code: string, message: string) => Object.assign(new Error(message), { name: "error", code });
/** Een Node-netwerkfout zoals pg die doorgeeft. */
const netFout = (code: string, message: string) => Object.assign(new Error(message), { code });

describe("veiligeFoutmelding: Postgres (ongewijzigd gedrag)", () => {
  const gevallen: [string, unknown, string][] = [
    [
      "verkeerd wachtwoord",
      pgFout("28P01", 'password authentication failed for user "postgres"'),
      'error (code 28P01): password authentication failed for user "postgres"',
    ],
    [
      "verkeerd wachtwoord (Neon)",
      pgFout("28P01", 'password authentication failed for user "neondb_owner"'),
      'error (code 28P01): password authentication failed for user "neondb_owner"',
    ],
    [
      "database bestaat niet",
      pgFout("3D000", 'database "bestaatniet" does not exist'),
      'error (code 3D000): database "bestaatniet" does not exist',
    ],
    [
      "tabel bestaat al (migratie)",
      pgFout("42P07", 'relation "articles" already exists'),
      'error (code 42P07): relation "articles" already exists',
    ],
    [
      "dubbele sleutel",
      pgFout("23505", 'duplicate key value violates unique constraint "tags_pkey"'),
      'error (code 23505): duplicate key value violates unique constraint "tags_pkey"',
    ],
    [
      "bestand met backslashes in het pad (blijft staan)",
      pgFout("58P01", 'could not open file "base\\16384\\1259": No such file or directory'),
      'error (code 58P01): could not open file "base\\16384\\1259": No such file or directory',
    ],
    [
      "geweigerd op een IP-adres",
      netFout("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432"),
      "Error (code ECONNREFUSED): connect ECONNREFUSED [ip]",
    ],
    [
      "time-out op een IP-adres",
      netFout("ETIMEDOUT", "connect ETIMEDOUT 10.0.0.5:5432"),
      "Error (code ETIMEDOUT): connect ETIMEDOUT [ip]",
    ],
    [
      "onbekende host met punten",
      netFout("ENOTFOUND", "getaddrinfo ENOTFOUND db.abcdefghij.supabase.co"),
      "Error (code ENOTFOUND): getaddrinfo ENOTFOUND [host]",
    ],
    [
      "onbekende host zonder punten (Docker-netwerknaam, blijft staan)",
      netFout("ENOTFOUND", "getaddrinfo ENOTFOUND postgres"),
      "Error (code ENOTFOUND): getaddrinfo ENOTFOUND postgres",
    ],
    [
      "TLS-certificaat",
      netFout("SELF_SIGNED_CERT_IN_CHAIN", "self-signed certificate in certificate chain"),
      "Error (code SELF_SIGNED_CERT_IN_CHAIN): self-signed certificate in certificate chain",
    ],
    ["pg-time-out zonder code", new Error("timeout expired"), "Error: timeout expired"],
    [
      "verbinding verbroken",
      new Error("Connection terminated due to connection timeout"),
      "Error: Connection terminated due to connection timeout",
    ],
    [
      "verbindings-URL in de tekst",
      new Error("ongeldige URL postgres://kb:geheim@db.example.com:5432/kb gevonden"),
      "Error: ongeldige URL [adres] gevonden",
    ],
    [
      "e-mailadres in de tekst",
      new Error("gebruiker kris@example.com bestaat al"),
      "Error: gebruiker [adres] bestaat al",
    ],
    [
      "tekst die op SQL Server lijkt, maar geen tedious-fout is (blijft staan)",
      new Error("Failed to connect to db01:5432 - Login failed for user 'kb'"),
      "Error: Failed to connect to db01:5432 - Login failed for user 'kb'",
    ],
    ["numerieke code", { code: 42, message: "x" }, "Error (code 42): x"],
    ["eigen naam zonder code", Object.assign(new Error("kapot"), { name: "TypeError" }), "TypeError: kapot"],
    ["lege tekst", new Error(""), "Error"],
    ["string", "zomaar tekst", "Error"],
    ["null", null, "Error"],
    ["undefined", undefined, "Error"],
    ["leeg object", {}, "Error"],
  ];

  for (const [naam, fout, verwacht] of gevallen) {
    it(naam, () => assert.equal(veiligeFoutmelding(fout), verwacht));
  }

  it("ECONNREFUSED op localhost: een AggregateError blijft één melding", () => {
    const fout = Object.assign(
      new AggregateError(
        [netFout("ECONNREFUSED", "connect ECONNREFUSED ::1:5432"), netFout("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432")],
        ""
      ),
      { code: "ECONNREFUSED" }
    );
    assert.equal(veiligeFoutmelding(fout), "AggregateError (code ECONNREFUSED)");
  });

  it("een lange tekst wordt na 200 tekens afgekapt", () => {
    const tekst = "a ".repeat(150);
    assert.equal(veiligeFoutmelding(new Error(tekst)), `Error: ${tekst.slice(0, 200)}`);
  });

  it("een ConfigFout komt ongewijzigd door", () => {
    const fout = new ConfigFout("DATABASE_URL ontbreekt (postgres://… van de database)");
    assert.equal(veiligeFoutmelding(fout), "Configuratiefout: DATABASE_URL ontbreekt (postgres://… van de database)");
  });
});
