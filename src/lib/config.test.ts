// Unittests voor leesConfig (npm run test:unit). De Postgres-fixtures zijn
// geschreven tegen de code van vóór SQL Server (main cb9213d) en moeten exact
// gelijk blijven: zo blijft de configuratie van beide live installaties
// (Supabase en Neon) gegarandeerd ongewijzigd.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigFout, leesConfig } from "./config";

const GEHEIM = "x".repeat(32);

/** Verwacht een ConfigFout met precies deze melding (zonder het voorvoegsel). */
function weigert(env: Record<string, string | undefined>, melding: string) {
  assert.throws(
    () => leesConfig(env),
    (err: unknown) => {
      assert.ok(err instanceof ConfigFout, `geen ConfigFout: ${String(err)}`);
      assert.equal(err.message, `Configuratiefout: ${melding}`);
      return true;
    }
  );
}

describe("leesConfig: Postgres (ongewijzigd gedrag)", () => {
  it("Supabase-installatie (productie): transaction pooler, standaardwaarden", () => {
    const env = {
      DATABASE_URL: "postgresql://postgres.abcdef:geheim@aws-0-eu-north-1.pooler.supabase.com:6543/postgres",
      NEXT_PUBLIC_SITE_URL: "https://kennis.voorbeeld.be/",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdef.supabase.co",
      VERCEL: "1",
    };
    assert.deepEqual(leesConfig(env), {
      db: {
        dialect: "postgres",
        url: "postgresql://postgres.abcdef:geheim@aws-0-eu-north-1.pooler.supabase.com:6543/postgres",
        poolMax: 5,
        ssl: { rejectUnauthorized: false },
      },
      auth: { driver: "supabase", registratie: "open" },
      storage: { driver: "supabase", dir: undefined },
      secret: undefined,
      autoMigrate: false,
      siteUrl: "https://kennis.voorbeeld.be",
    });
  });

  it("Neon-achtige installatie: sslmode uit de URL, eigen login, opslag in de database", () => {
    const env = {
      DB_DIALECT: "postgres",
      AUTH_DRIVER: "local",
      STORAGE_DRIVER: "database",
      REGISTRATIE: "uitnodiging",
      DB_AUTO_MIGRATE: "true",
      DATABASE_URL:
        "postgresql://kb_owner:geheim@ep-stil-water-a1b2c3-pooler.eu-central-1.aws.neon.tech/kennisbank?sslmode=require&channel_binding=require",
      DATABASE_POOL_MAX: "3",
      BETTER_AUTH_SECRET: GEHEIM,
      SITE_URL: "https://kennisbank-werk.vercel.app/",
      VERCEL: "1",
    };
    assert.deepEqual(leesConfig(env), {
      db: {
        dialect: "postgres",
        url: "postgresql://kb_owner:geheim@ep-stil-water-a1b2c3-pooler.eu-central-1.aws.neon.tech/kennisbank?channel_binding=require",
        poolMax: 3,
        ssl: { rejectUnauthorized: false },
      },
      auth: { driver: "local", registratie: "uitnodiging" },
      storage: { driver: "database", dir: undefined },
      secret: GEHEIM,
      autoMigrate: true,
      siteUrl: "https://kennisbank-werk.vercel.app",
    });
  });

  it("localhost: geen TLS, lege waarden tellen als niet gezet", () => {
    const env = {
      DB_DIALECT: "",
      AUTH_DRIVER: "",
      STORAGE_DRIVER: "",
      DATABASE_URL: "postgres://postgres:lokaal@localhost:54329/kbbuild",
      DATABASE_SSL: "",
      DATABASE_POOL_MAX: "",
      SITE_URL: "",
    };
    assert.deepEqual(leesConfig(env), {
      db: {
        dialect: "postgres",
        url: "postgres://postgres:lokaal@localhost:54329/kbbuild",
        poolMax: 5,
        ssl: false,
      },
      auth: { driver: "supabase", registratie: "open" },
      storage: { driver: "supabase", dir: undefined },
      secret: undefined,
      autoMigrate: false,
      siteUrl: undefined,
    });
  });

  it("zelf gehost met map-opslag (Docker): host db, sslmode=disable", () => {
    const dir = process.platform === "win32" ? "D:\\kennisbank\\bestanden" : "/var/lib/kennisbank/bestanden";
    const env = {
      AUTH_DRIVER: "local",
      STORAGE_DRIVER: "filesystem",
      STORAGE_DIR: dir,
      DATABASE_URL: "postgres://kb:geheim@db:5432/kennisbank?sslmode=disable",
      BETTER_AUTH_SECRET: GEHEIM,
      SITE_URL: "http://kennis.intern:3000",
    };
    assert.deepEqual(leesConfig(env), {
      db: { dialect: "postgres", url: "postgres://kb:geheim@db:5432/kennisbank", poolMax: 5, ssl: false },
      auth: { driver: "local", registratie: "open" },
      storage: { driver: "filesystem", dir },
      secret: GEHEIM,
      autoMigrate: false,
      siteUrl: "http://kennis.intern:3000",
    });
  });

  it("TLS-varianten: verify met CA (PEM en base64), verify-full, DATABASE_SSL wint van sslmode", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----\n";
    const basis = { DATABASE_URL: "postgres://u:p@db.voorbeeld.be:5432/kb" };
    assert.deepEqual(leesConfig({ ...basis, DATABASE_SSL: "verify", DATABASE_SSL_CA: pem }).db.ssl, {
      rejectUnauthorized: true,
      ca: pem,
    });
    assert.deepEqual(
      leesConfig({ ...basis, DATABASE_SSL: "verify", DATABASE_SSL_CA: Buffer.from(pem).toString("base64") }).db.ssl,
      { rejectUnauthorized: true, ca: pem }
    );
    assert.deepEqual(leesConfig({ ...basis, DATABASE_SSL: "verify" }).db.ssl, { rejectUnauthorized: true });
    assert.deepEqual(
      leesConfig({ DATABASE_URL: "postgres://u:p@db.voorbeeld.be/kb?sslmode=verify-full&sslrootcert=/x.pem" }).db,
      { dialect: "postgres", url: "postgres://u:p@db.voorbeeld.be/kb", poolMax: 5, ssl: { rejectUnauthorized: true } }
    );
    assert.deepEqual(
      leesConfig({ DATABASE_URL: "postgres://u:p@db.voorbeeld.be/kb?sslmode=disable", DATABASE_SSL: "no-verify" }).db.ssl,
      { rejectUnauthorized: false }
    );
    assert.equal(leesConfig({ ...basis, DATABASE_SSL: "off" }).db.ssl, false);
    assert.deepEqual(leesConfig({ DATABASE_URL: "postgres://u:p@localhost/kb", DATABASE_SSL: "no-verify" }).db.ssl, {
      rejectUnauthorized: false,
    });
  });

  it("MSSQL_*-variabelen worden genegeerd bij Postgres, ook ongeldige", () => {
    const env = {
      DATABASE_URL: "postgres://postgres:lokaal@localhost:54329/kbbuild",
      MSSQL_SERVER: "sqlsrv01\\SQLEXPRESS,abc",
      MSSQL_PORT: "geen-getal",
      MSSQL_DATABASE: "",
      MSSQL_AUTH: "onbekend",
      MSSQL_ENCRYPT: "misschien",
      MSSQL_TRUST_SERVER_CERT: "ja",
    };
    assert.deepEqual(leesConfig(env), leesConfig({ DATABASE_URL: env.DATABASE_URL }));
  });

  it("weigert onmogelijke combinaties, in dezelfde volgorde en met dezelfde meldingen", () => {
    const url = "postgres://postgres:lokaal@localhost:54329/kbbuild";
    weigert({ DB_DIALECT: "oracle", DATABASE_URL: url }, 'DB_DIALECT: Invalid option: expected one of "postgres"|"mssql"');
    weigert({ DATABASE_URL: url, DATABASE_POOL_MAX: "0" }, "DATABASE_POOL_MAX: Too small: expected number to be >0");
    weigert(
      { DATABASE_URL: url, AUTH_DRIVER: "local", BETTER_AUTH_SECRET: "kort" },
      "BETTER_AUTH_SECRET: moet minstens 32 tekens lang zijn"
    );
    weigert({ DB_DIALECT: "mssql" }, "AUTH_DRIVER=supabase kan alleen met DB_DIALECT=postgres");
    weigert(
      { AUTH_DRIVER: "local", STORAGE_DRIVER: "supabase", DATABASE_URL: url },
      "STORAGE_DRIVER=supabase kan alleen met AUTH_DRIVER=supabase"
    );
    weigert(
      { AUTH_DRIVER: "local", STORAGE_DRIVER: "filesystem", DATABASE_URL: url },
      "STORAGE_DRIVER=filesystem vraagt ook STORAGE_DIR"
    );
    weigert(
      { AUTH_DRIVER: "local", STORAGE_DRIVER: "filesystem", STORAGE_DIR: "bestanden", DATABASE_URL: url },
      "STORAGE_DIR moet een absoluut pad zijn, buiten de map van de code (bv. D:\\kennisbank\\bestanden of /var/lib/kennisbank/bestanden)"
    );
    weigert(
      {
        AUTH_DRIVER: "local",
        STORAGE_DRIVER: "filesystem",
        STORAGE_DIR: process.cwd(),
        DATABASE_URL: url,
        VERCEL: "1",
      },
      "STORAGE_DRIVER=filesystem werkt niet op Vercel (de schijf is daar tijdelijk)"
    );
    weigert(
      { STORAGE_DRIVER: "database", DATABASE_URL: url },
      "STORAGE_DRIVER=database kan alleen met de eigen login (AUTH_DRIVER=local)"
    );
    weigert({}, "DATABASE_URL ontbreekt");
    weigert({ AUTH_DRIVER: "local", STORAGE_DRIVER: "database" }, "DATABASE_URL ontbreekt");
    weigert(
      { AUTH_DRIVER: "local", STORAGE_DRIVER: "database", DATABASE_URL: url },
      "BETTER_AUTH_SECRET ontbreekt (nodig voor de eigen login en voor opslag in de database of een map)"
    );
    weigert(
      { AUTH_DRIVER: "local", STORAGE_DRIVER: "database", DATABASE_URL: url, BETTER_AUTH_SECRET: GEHEIM },
      "SITE_URL ontbreekt (het publieke adres van deze installatie, bv. https://kennis.voorbeeld.be)"
    );
    weigert(
      {
        AUTH_DRIVER: "local",
        STORAGE_DRIVER: "database",
        DATABASE_URL: "geen url",
        BETTER_AUTH_SECRET: GEHEIM,
        SITE_URL: "http://localhost:3001",
      },
      "DATABASE_URL is geen geldige URL"
    );
    // Een ongeldige URL valt pas op na de controles op geheim en adres.
    weigert({ AUTH_DRIVER: "local", STORAGE_DRIVER: "database", DATABASE_URL: "geen url" }, "BETTER_AUTH_SECRET ontbreekt (nodig voor de eigen login en voor opslag in de database of een map)");
  });
});
