// Unittests voor leesConfig (npm run test:unit). De Postgres-fixtures zijn
// geschreven tegen de code van vóór SQL Server (main cb9213d) en moeten exact
// gelijk blijven: zo blijft de configuratie van beide live installaties
// (Supabase en Neon) gegarandeerd ongewijzigd.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigFout, leesConfig } from "./config";

const GEHEIM = "x".repeat(32);

/** De TLS-instelling van een Postgres-configuratie. */
function ssl(env: Record<string, string | undefined>) {
  const { db } = leesConfig(env);
  if (db.dialect !== "postgres") throw new Error("geen Postgres-configuratie");
  return db.ssl;
}

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
    assert.deepEqual(ssl({ ...basis, DATABASE_SSL: "verify", DATABASE_SSL_CA: pem }), {
      rejectUnauthorized: true,
      ca: pem,
    });
    assert.deepEqual(
      ssl({ ...basis, DATABASE_SSL: "verify", DATABASE_SSL_CA: Buffer.from(pem).toString("base64") }),
      { rejectUnauthorized: true, ca: pem }
    );
    assert.deepEqual(ssl({ ...basis, DATABASE_SSL: "verify" }), { rejectUnauthorized: true });
    assert.deepEqual(
      leesConfig({ DATABASE_URL: "postgres://u:p@db.voorbeeld.be/kb?sslmode=verify-full&sslrootcert=/x.pem" }).db,
      { dialect: "postgres", url: "postgres://u:p@db.voorbeeld.be/kb", poolMax: 5, ssl: { rejectUnauthorized: true } }
    );
    assert.deepEqual(
      ssl({ DATABASE_URL: "postgres://u:p@db.voorbeeld.be/kb?sslmode=disable", DATABASE_SSL: "no-verify" }),
      { rejectUnauthorized: false }
    );
    assert.equal(ssl({ ...basis, DATABASE_SSL: "off" }), false);
    assert.deepEqual(ssl({ DATABASE_URL: "postgres://u:p@localhost/kb", DATABASE_SSL: "no-verify" }), {
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

describe("leesConfig: SQL Server", () => {
  const BASIS = {
    DB_DIALECT: "mssql",
    AUTH_DRIVER: "local",
    STORAGE_DRIVER: "database",
    BETTER_AUTH_SECRET: GEHEIM,
    SITE_URL: "http://kennis.intern:3000/",
    MSSQL_SERVER: "sqlsrv01",
    MSSQL_DATABASE: "kennisbank",
    MSSQL_USER: "kb_app",
    MSSQL_PASSWORD: "p;a/s#s?w%o=r d",
  };
  const mssql = (env: Record<string, string | undefined>) => {
    const { db } = leesConfig(env);
    if (db.dialect !== "mssql") throw new Error("geen SQL Server-configuratie");
    return db;
  };

  it("standaard: SQL-login, poort 1433 impliciet, versleuteld, certificaat vertrouwd", () => {
    assert.deepEqual(leesConfig({ ...BASIS, DATABASE_URL: "postgres://wordt-genegeerd/x" }), {
      db: {
        dialect: "mssql",
        server: "sqlsrv01",
        database: "kennisbank",
        auth: { type: "sql", user: "kb_app", password: "p;a/s#s?w%o=r d" },
        encrypt: true,
        trustServerCertificate: true,
        poolMax: 5,
      },
      auth: { driver: "local", registratie: "open" },
      storage: { driver: "database", dir: undefined },
      secret: GEHEIM,
      autoMigrate: false,
      siteUrl: "http://kennis.intern:3000",
    });
  });

  it("DATABASE_URL is niet nodig", () => {
    assert.equal(leesConfig(BASIS).db.dialect, "mssql");
  });

  it("MSSQL_SERVER zoals uit SSMS: host,poort, tcp:host,poort, host\\INSTANTIE", () => {
    const komma = mssql({ ...BASIS, MSSQL_SERVER: "sqlsrv01,14330" });
    assert.deepEqual([komma.server, komma.port, komma.instanceName], ["sqlsrv01", 14330, undefined]);
    const tcp = mssql({ ...BASIS, MSSQL_SERVER: "tcp:sql.voorbeeld.be, 1433" });
    assert.deepEqual([tcp.server, tcp.port, tcp.instanceName], ["sql.voorbeeld.be", 1433, undefined]);
    const inst = mssql({ ...BASIS, MSSQL_SERVER: "SQL01\\SQLEXPRESS" });
    assert.deepEqual([inst.server, inst.port, inst.instanceName], ["SQL01", undefined, "SQLEXPRESS"]);
    const los = mssql({ ...BASIS, MSSQL_SERVER: "10.0.0.5", MSSQL_PORT: "1444", DATABASE_POOL_MAX: "8" });
    assert.deepEqual([los.server, los.port, los.poolMax], ["10.0.0.5", 1444, 8]);
    const instVar = mssql({ ...BASIS, MSSQL_INSTANCE: "KENNIS" });
    assert.deepEqual([instVar.port, instVar.instanceName], [undefined, "KENNIS"]);
    // Dezelfde waarde twee keer is geen tegenspraak.
    assert.equal(mssql({ ...BASIS, MSSQL_SERVER: "sqlsrv01,1433", MSSQL_PORT: "1433" }).port, 1433);
    assert.equal(mssql({ ...BASIS, MSSQL_SERVER: "SQL01\\sqlexpress", MSSQL_INSTANCE: "SQLEXPRESS" }).instanceName, "sqlexpress");
  });

  it("weigert ongeldige servernamen, en poort en instantie samen", () => {
    const beide =
      "Geef een poort óf een instantienaam op, niet allebei (een vaste poort is aanbevolen; een instantie gebruikt SQL Browser op UDP 1434)";
    weigert({ ...BASIS, MSSQL_SERVER: "SQL01\\SQLEXPRESS,1433" }, beide);
    weigert({ ...BASIS, MSSQL_SERVER: "SQL01\\SQLEXPRESS", MSSQL_PORT: "1433" }, beide);
    weigert({ ...BASIS, MSSQL_PORT: "1433", MSSQL_INSTANCE: "SQLEXPRESS" }, beide);
    weigert({ ...BASIS, MSSQL_SERVER: "sqlsrv01,1433", MSSQL_PORT: "1434" }, "MSSQL_SERVER en MSSQL_PORT noemen een verschillende poort");
    weigert(
      { ...BASIS, MSSQL_SERVER: "SQL01\\A", MSSQL_INSTANCE: "B" },
      "MSSQL_SERVER en MSSQL_INSTANCE noemen een verschillende instantie"
    );
    const poortNaKomma = "MSSQL_SERVER: na de komma hoort een poortnummer (bv. sqlsrv01,1433)";
    weigert({ ...BASIS, MSSQL_SERVER: "sqlsrv01,abc" }, poortNaKomma);
    weigert({ ...BASIS, MSSQL_SERVER: "sqlsrv01,70000" }, poortNaKomma);
    weigert(
      { ...BASIS, MSSQL_SERVER: "np:\\\\sqlsrv01\\pipe\\sql\\query" },
      "MSSQL_SERVER: alleen TCP-verbindingen worden ondersteund (geen np:)"
    );
    weigert(
      { ...BASIS, MSSQL_SERVER: "sqlserver://sqlsrv01:1433" },
      "MSSQL_SERVER: geef een servernaam, geen URL (bv. sqlsrv01 of sqlsrv01,1433)"
    );
    // IPv6 is geen protocol.
    assert.equal(mssql({ ...BASIS, MSSQL_SERVER: "fd00:abcd::5,1433" }).server, "fd00:abcd::5");
    weigert({ ...BASIS, MSSQL_SERVER: "SQL01\\" }, "MSSQL_SERVER: ongeldige instantienaam (verwacht host\\INSTANTIE)");
    weigert({ ...BASIS, MSSQL_SERVER: ",1433" }, "MSSQL_SERVER: ongeldige servernaam");
    weigert({ ...BASIS, MSSQL_SERVER: "sql srv" }, "MSSQL_SERVER: ongeldige servernaam");
    weigert({ ...BASIS, MSSQL_PORT: "0" }, "MSSQL_PORT: Too small: expected number to be >=1");
  });

  it("verplichte variabelen", () => {
    const geenServer = "MSSQL_SERVER ontbreekt (de naam of het adres van de SQL Server)";
    weigert({ ...BASIS, MSSQL_SERVER: undefined }, geenServer);
    weigert({ ...BASIS, MSSQL_SERVER: "" }, geenServer);
    weigert({ ...BASIS, MSSQL_DATABASE: "" }, "MSSQL_DATABASE ontbreekt (de naam van de database)");
    const geenLogin = "MSSQL_USER en MSSQL_PASSWORD ontbreken (de SQL Server-login van de kennisbank)";
    weigert({ ...BASIS, MSSQL_PASSWORD: undefined }, geenLogin);
    weigert({ ...BASIS, MSSQL_USER: "" }, geenLogin);
    weigert({ ...BASIS, MSSQL_AUTH: "kerberos" }, 'MSSQL_AUTH: Invalid option: expected one of "sql"|"ntlm"|"azure-default"');
  });

  it("SQL Server alleen met de eigen login, en nooit op Vercel", () => {
    weigert(
      { ...BASIS, AUTH_DRIVER: undefined, STORAGE_DRIVER: undefined },
      "AUTH_DRIVER=supabase kan alleen met DB_DIALECT=postgres"
    );
    const vercel = "SQL Server wordt op Vercel niet ondersteund; host de kennisbank zelf (Docker of Windows-dienst)";
    weigert({ ...BASIS, VERCEL: "1" }, vercel);
    // Ook zonder MSSQL_*-variabelen komt eerst de Vercel-weigering.
    weigert({ DB_DIALECT: "mssql", AUTH_DRIVER: "local", STORAGE_DRIVER: "database", VERCEL: "1" }, vercel);
    // Daarna gelden de gewone regels nog steeds.
    weigert(
      { ...BASIS, BETTER_AUTH_SECRET: undefined },
      "BETTER_AUTH_SECRET ontbreekt (nodig voor de eigen login en voor opslag in de database of een map)"
    );
    weigert(
      { ...BASIS, SITE_URL: undefined },
      "SITE_URL ontbreekt (het publieke adres van deze installatie, bv. https://kennis.voorbeeld.be)"
    );
  });

  it("NTLM: domein apart of als DOMEIN\\naam", () => {
    const ntlm = { ...BASIS, MSSQL_AUTH: "ntlm" };
    const verwacht = { type: "ntlm", domain: "BEDRIJF", user: "svc_kb", password: BASIS.MSSQL_PASSWORD };
    assert.deepEqual(mssql({ ...ntlm, MSSQL_DOMAIN: "BEDRIJF", MSSQL_USER: "svc_kb" }).auth, verwacht);
    assert.deepEqual(mssql({ ...ntlm, MSSQL_USER: "BEDRIJF\\svc_kb" }).auth, verwacht);
    assert.deepEqual(mssql({ ...ntlm, MSSQL_USER: "bedrijf\\svc_kb", MSSQL_DOMAIN: "BEDRIJF" }).auth, {
      ...verwacht,
      domain: "bedrijf",
    });
    const vraagt = "MSSQL_AUTH=ntlm vraagt MSSQL_DOMAIN, MSSQL_USER en MSSQL_PASSWORD (of MSSQL_USER als DOMEIN\\naam)";
    weigert(ntlm, vraagt);
    weigert({ ...ntlm, MSSQL_DOMAIN: "BEDRIJF", MSSQL_PASSWORD: undefined }, vraagt);
    weigert({ ...ntlm, MSSQL_USER: "BEDRIJF\\" }, vraagt);
    weigert(
      { ...ntlm, MSSQL_USER: "ANDER\\svc_kb", MSSQL_DOMAIN: "BEDRIJF" },
      "MSSQL_DOMAIN en het domein in MSSQL_USER (DOMEIN\\naam) verschillen"
    );
    weigert(
      { ...BASIS, MSSQL_USER: "BEDRIJF\\svc_kb" },
      "MSSQL_USER is een Windows-account (DOMEIN\\naam): gebruik MSSQL_AUTH=ntlm"
    );
  });

  it("azure-default: met of zonder client-id, nooit zonder versleuteling", () => {
    const azure = { ...BASIS, MSSQL_AUTH: "azure-default", MSSQL_USER: undefined, MSSQL_PASSWORD: undefined };
    assert.deepEqual(mssql(azure).auth, { type: "azure-default" });
    assert.deepEqual(mssql({ ...azure, MSSQL_AZURE_CLIENT_ID: "1234-abcd" }).auth, {
      type: "azure-default",
      clientId: "1234-abcd",
    });
    assert.equal(mssql({ ...azure, MSSQL_ENCRYPT: "strict" }).encrypt, "strict");
    const onversleuteld = "MSSQL_AUTH=azure-default kan niet met MSSQL_ENCRYPT=false";
    weigert({ ...azure, MSSQL_ENCRYPT: "false" }, onversleuteld);
    weigert({ ...azure, MSSQL_SERVER: "localhost", MSSQL_ENCRYPT: "false" }, onversleuteld);
  });

  it("versleuteling en certificaten", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----\n";
    const strikt = mssql({ ...BASIS, MSSQL_ENCRYPT: "strict" });
    assert.deepEqual([strikt.encrypt, strikt.trustServerCertificate], ["strict", false]);
    assert.equal(mssql({ ...BASIS, MSSQL_ENCRYPT: "strict", MSSQL_TRUST_SERVER_CERT: "false" }).encrypt, "strict");
    weigert(
      { ...BASIS, MSSQL_ENCRYPT: "strict", MSSQL_TRUST_SERVER_CERT: "true" },
      "MSSQL_ENCRYPT=strict kan niet met MSSQL_TRUST_SERVER_CERT=true: strict controleert het certificaat altijd"
    );
    const gecontroleerd = mssql({ ...BASIS, MSSQL_TRUST_SERVER_CERT: "false", MSSQL_TLS_SERVERNAME: "sql.voorbeeld.be" });
    assert.deepEqual(
      [gecontroleerd.encrypt, gecontroleerd.trustServerCertificate, gecontroleerd.tlsServerName],
      [true, false, "sql.voorbeeld.be"]
    );
    // Een CA (PEM of base64) betekent: controleren.
    const metCa = mssql({ ...BASIS, MSSQL_CA: Buffer.from(pem).toString("base64") });
    assert.deepEqual([metCa.ca, metCa.trustServerCertificate], [pem, false]);
    assert.equal(mssql({ ...BASIS, MSSQL_CA: pem }).ca, pem);
    weigert(
      { ...BASIS, MSSQL_CA: pem, MSSQL_TRUST_SERVER_CERT: "true" },
      "MSSQL_CA heeft geen zin met MSSQL_TRUST_SERVER_CERT=true (dan wordt het certificaat niet gecontroleerd)"
    );
    // Een TLS-servernaam alleen betekent ook: controleren (tegen die naam).
    const metNaam = mssql({ ...BASIS, MSSQL_SERVER: "10.0.0.5", MSSQL_TLS_SERVERNAME: "sql.voorbeeld.be" });
    assert.deepEqual(
      [metNaam.encrypt, metNaam.trustServerCertificate, metNaam.tlsServerName],
      [true, false, "sql.voorbeeld.be"]
    );
    assert.equal(mssql({ ...BASIS, MSSQL_ENCRYPT: "strict", MSSQL_TLS_SERVERNAME: "sql.voorbeeld.be" }).trustServerCertificate, false);
    weigert(
      { ...BASIS, MSSQL_TLS_SERVERNAME: "sql.voorbeeld.be", MSSQL_TRUST_SERVER_CERT: "true" },
      "MSSQL_TLS_SERVERNAME heeft geen zin met MSSQL_TRUST_SERVER_CERT=true (dan wordt het certificaat niet gecontroleerd)"
    );
    weigert({ ...BASIS, MSSQL_ENCRYPT: "ja" }, 'MSSQL_ENCRYPT: Invalid option: expected one of "true"|"false"|"strict"');
    weigert(
      { ...BASIS, MSSQL_TRUST_SERVER_CERT: "ja" },
      'MSSQL_TRUST_SERVER_CERT: Invalid option: expected one of "true"|"false"'
    );
  });

  it("MSSQL_ENCRYPT=false alleen voor een server op deze machine", () => {
    const onversleuteld =
      "MSSQL_ENCRYPT=false mag alleen voor een server op deze machine (localhost): anders gaat het wachtwoord onversleuteld over het netwerk";
    weigert({ ...BASIS, MSSQL_ENCRYPT: "false" }, onversleuteld);
    weigert({ ...BASIS, MSSQL_SERVER: "10.0.0.5,1433", MSSQL_ENCRYPT: "false" }, onversleuteld);
    weigert({ ...BASIS, MSSQL_SERVER: "127.example.com", MSSQL_ENCRYPT: "false" }, onversleuteld);
    for (const host of ["localhost", "LOCALHOST\\SQLEXPRESS", "127.0.0.1,1433", "127.1.2.3", "::1"]) {
      assert.equal(mssql({ ...BASIS, MSSQL_SERVER: host, MSSQL_ENCRYPT: "false" }).encrypt, false, host);
    }
  });
});
