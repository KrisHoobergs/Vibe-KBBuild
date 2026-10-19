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

// Zo maakt tedious zijn fouten: ConnectionError/RequestError zetten geen eigen
// name (dus "Error"), wel een code; serverfouten hebben een nummer.
const verbindingsfout = (code: string, message: string) => Object.assign(new Error(message), { code });
const serverfout = (number: number, message: string) => Object.assign(new Error(message), { code: "EREQUEST", number });

describe("veiligeFoutmelding: SQL Server (tedious)", () => {
  const gevallen: [string, unknown, string][] = [
    [
      "servernaam zonder punten en poort",
      verbindingsfout("ESOCKET", "Failed to connect to sqlsrv01:1433 - connect ECONNREFUSED 10.1.2.3:1433"),
      "Error (code ESOCKET): Failed to connect to [server] - connect ECONNREFUSED [server]",
    ],
    [
      "IPv6-adres in de socketfout",
      verbindingsfout("ESOCKET", "Failed to connect to localhost:1 - connect ECONNREFUSED ::1:1"),
      "Error (code ESOCKET): Failed to connect to [server] - connect ECONNREFUSED [server]",
    ],
    [
      "onbekende server",
      verbindingsfout("ESOCKET", "Failed to connect to sqlsrv01:1433 - getaddrinfo ENOTFOUND sqlsrv01"),
      "Error (code ESOCKET): Failed to connect to [server] - getaddrinfo ENOTFOUND [server]",
    ],
    [
      "host\\INSTANTIE bij een time-out",
      verbindingsfout("ETIMEOUT", "Failed to connect to SQL01\\SQLEXPRESS in 15000ms"),
      "Error (code ETIMEOUT): Failed to connect to [server] in 15000ms",
    ],
    [
      "host\\INSTANTIE elders in de tekst",
      verbindingsfout("ESOCKET", "Connection lost - instantie SQL01\\SQLEXPRESS gaf geen antwoord"),
      "Error (code ESOCKET): Connection lost - instantie [server] gaf geen antwoord",
    ],
    [
      "SQL Browser antwoordt niet",
      verbindingsfout("EINSTLOOKUP", "Failed to get response from SQL Server Browser on sqlsrv01"),
      "Error (code EINSTLOOKUP): Failed to get response from SQL Server Browser on [server]",
    ],
    [
      "instantie niet gevonden",
      verbindingsfout("EINSTLOOKUP", "Port for SQLEXPRESS not found in sqlsrv01"),
      "Error (code EINSTLOOKUP): Port for [instantie] not found in [server]",
    ],
    [
      "verkeerd wachtwoord (18456)",
      verbindingsfout("ELOGIN", "Login failed for user 'kb'."),
      "Error (code ELOGIN): Login failed for user '[gebruiker]'.",
    ],
    [
      "verkeerd wachtwoord, Windows-account",
      verbindingsfout("ELOGIN", "Login failed for user 'DOMEIN\\svc_kb'."),
      "Error (code ELOGIN): Login failed for user '[gebruiker]'.",
    ],
    [
      "database bestaat niet of geen toegang (4060)",
      verbindingsfout("ELOGIN", 'Cannot open database "kennisbank" requested by the login. The login failed.'),
      'Error (code ELOGIN): Cannot open database "[database]" requested by the login. The login failed.',
    ],
    [
      "geen recht om tabellen te maken (262, app-login zonder db_ddladmin)",
      serverfout(262, "CREATE TABLE permission denied in database 'kennisbank'."),
      "Error (code EREQUEST, nr 262): CREATE TABLE permission denied in database '[database]'.",
    ],
    [
      "geen recht op een object (229)",
      serverfout(229, "The SELECT permission was denied on the object 'articles', database 'kennisbank', schema 'dbo'."),
      "Error (code EREQUEST, nr 229): The SELECT permission was denied on the object 'articles', database '[database]', schema 'dbo'.",
    ],
    [
      "Azure SQL even niet beschikbaar (40613)",
      verbindingsfout(
        "ELOGIN",
        "Database 'kennisbank' on server 'mijnserver' is not currently available.  Please retry the connection later."
      ),
      "Error (code ELOGIN): Database '[database]' on server '[server]' is not currently available.  Please retry the connection later.",
    ],
    [
      "Azure SQL-firewall (40615)",
      verbindingsfout(
        "ELOGIN",
        "Cannot open server 'mijnserver' requested by the login. Client with IP address '203.0.113.7' is not allowed to access the server."
      ),
      "Error (code ELOGIN): Cannot open server '[server]' requested by the login. Client with IP address '[ip]' is not allowed to access the server.",
    ],
    [
      "Azure SQL, server tussen dubbele aanhalingstekens (40532)",
      verbindingsfout("ELOGIN", 'Cannot open server "mijnserver" requested by the login. The login failed.'),
      'Error (code ELOGIN): Cannot open server "[server]" requested by the login. The login failed.',
    ],
    [
      "database in herstel (922)",
      serverfout(922, "Database 'kennisbank' is being recovered. Waiting until recovery is finished."),
      "Error (code EREQUEST, nr 922): Database '[database]' is being recovered. Waiting until recovery is finished.",
    ],
    [
      "certificaat op een andere naam",
      verbindingsfout(
        "ESOCKET",
        "Failed to connect to sqlsrv01:1433 - Hostname/IP does not match certificate's altnames: Host: sqlsrv01. is not in the cert's altnames: DNS:andere-naam"
      ),
      "Error (code ESOCKET): Failed to connect to [server] - Hostname/IP does not match certificate's altnames: Host: [server] is not in the cert's altnames: [certificaat]",
    ],
    [
      "versleuteling",
      verbindingsfout("EENCRYPT", "Server requires encryption, set 'encrypt' config option to `true`."),
      "Error (code EENCRYPT): Server requires encryption, set 'encrypt' config option to `true`.",
    ],
    [
      "serverfout met nummer",
      serverfout(547, 'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_articles_author".'),
      'Error (code EREQUEST, nr 547): The INSERT statement conflicted with the FOREIGN KEY constraint "FK_articles_author".',
    ],
    [
      "nummer zonder code",
      Object.assign(new Error("Invalid column name 'x'."), { number: 207 }),
      "Error (nr 207): Invalid column name 'x'.",
    ],
    [
      "volledige servernaam met punten valt onder de algemene regel",
      verbindingsfout("ESOCKET", "Failed to connect to sql01.corp.local:1433 - read ECONNRESET"),
      "Error (code ESOCKET): Failed to connect to [server] - read ECONNRESET",
    ],
  ];

  for (const [naam, fout, verwacht] of gevallen) {
    it(naam, () => assert.equal(veiligeFoutmelding(fout), verwacht));
  }

  it("meerdere serverfouten (array van Kysely) worden samengevoegd", () => {
    const fout = [
      serverfout(1505, "The CREATE UNIQUE INDEX statement terminated because a duplicate key was found."),
      serverfout(1750, "Could not create constraint or index. See previous errors."),
    ];
    assert.equal(
      veiligeFoutmelding(fout),
      "Error (code EREQUEST, nr 1505): The CREATE UNIQUE INDEX statement terminated because a duplicate key was found." +
        " | Error (code EREQUEST, nr 1750): Could not create constraint or index. See previous errors."
    );
  });

  it("een AggregateError met tedious-fouten wordt ook uitgepakt", () => {
    const fout = new AggregateError([serverfout(2627, "Violation of UNIQUE KEY constraint 'UQ_tags_slug'."), serverfout(3621, "The statement has been terminated.")]);
    assert.equal(
      veiligeFoutmelding(fout),
      "Error (code EREQUEST, nr 2627): Violation of UNIQUE KEY constraint 'UQ_tags_slug'. | Error (code EREQUEST, nr 3621): The statement has been terminated."
    );
  });

  it("hoogstens drie fouten, de rest geteld", () => {
    const fout = [1, 2, 3, 4, 5].map((n) => serverfout(50000 + n, `fout ${n}`));
    assert.equal(
      veiligeFoutmelding(fout),
      "Error (code EREQUEST, nr 50001): fout 1 | Error (code EREQUEST, nr 50002): fout 2 | Error (code EREQUEST, nr 50003): fout 3 | … en 2 meer"
    );
  });

  it("elke fout wordt apart ontsmet en afgekapt", () => {
    const lang = "x".repeat(300);
    const fout = [verbindingsfout("ELOGIN", "Login failed for user 'kb'."), serverfout(1, lang)];
    assert.equal(
      veiligeFoutmelding(fout),
      `Error (code ELOGIN): Login failed for user '[gebruiker]'. | Error (code EREQUEST, nr 1): ${lang.slice(0, 200)}`
    );
  });

  it("een lege array", () => {
    assert.equal(veiligeFoutmelding([]), "Error");
  });

  it("lekt geen server, gebruiker, instantie of database", () => {
    const geheimen = ["sqlsrv01", "SQLEXPRESS", "kb_geheime_gebruiker", "10.1.2.3", "kb_geheime_db"];
    const fouten = [
      verbindingsfout("ELOGIN", "Login failed for user 'kb_geheime_gebruiker'."),
      verbindingsfout("ESOCKET", "Failed to connect to sqlsrv01\\SQLEXPRESS - connect ETIMEDOUT 10.1.2.3:1433"),
      verbindingsfout("ETIMEOUT", "Failed to connect to sqlsrv01:1433 (redirected from sqlsrv01:1433) in 15000ms"),
      verbindingsfout("EINSTLOOKUP", "Port for SQLEXPRESS not found in sqlsrv01"),
      verbindingsfout("ELOGIN", 'Cannot open database "kb_geheime_db" requested by the login. The login failed.'),
      serverfout(262, "CREATE TABLE permission denied in database 'kb_geheime_db'."),
      verbindingsfout("ELOGIN", "Database 'kb_geheime_db' on server 'sqlsrv01' is not currently available."),
      verbindingsfout("ELOGIN", "Cannot open server 'sqlsrv01' requested by the login."),
    ];
    for (const fout of fouten) {
      const melding = veiligeFoutmelding(fout);
      for (const geheim of geheimen) assert.ok(!melding.includes(geheim), `${geheim} in: ${melding}`);
    }
  });
});
