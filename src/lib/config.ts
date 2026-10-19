import path from "node:path";
import { z } from "zod";

// Configuratie van deze installatie, uit server-side env-variabelen. Bewust geen
// NEXT_PUBLIC_*: die liggen bij de build vast, en de browser hoeft niet te weten
// welke backend er draait. De standaardwaarden zijn die van de oorspronkelijke
// Supabase-installatie.
//
// Geen "server-only"-import: de scripts in scripts/ gebruiken dit bestand ook.

const leegIsOngezet = (v: unknown) => (v === "" ? undefined : v);

const envSchema = z.object({
  DB_DIALECT: z.preprocess(leegIsOngezet, z.enum(["postgres", "mssql"]).default("postgres")),
  AUTH_DRIVER: z.preprocess(leegIsOngezet, z.enum(["supabase", "local"]).default("supabase")),
  STORAGE_DRIVER: z.preprocess(
    leegIsOngezet,
    z.enum(["supabase", "database", "filesystem"]).default("supabase")
  ),
  REGISTRATIE: z.preprocess(leegIsOngezet, z.enum(["open", "uitnodiging"]).default("open")),

  DATABASE_URL: z.preprocess(leegIsOngezet, z.string().optional()),
  DATABASE_POOL_MAX: z.preprocess(leegIsOngezet, z.coerce.number().int().positive().default(5)),
  // "verify" controleert het certificaat (met DATABASE_SSL_CA, of de standaard
  // vertrouwde CA's), "no-verify" versleutelt zonder controle, "off" zonder TLS.
  // Standaard: "off" voor localhost, anders "no-verify". Supabase gebruikt een
  // eigen CA: voor "verify" dus DATABASE_SSL_CA invullen.
  DATABASE_SSL: z.preprocess(leegIsOngezet, z.enum(["verify", "no-verify", "off"]).optional()),
  DATABASE_SSL_CA: z.preprocess(leegIsOngezet, z.string().optional()),

  STORAGE_DIR: z.preprocess(leegIsOngezet, z.string().optional()),

  // Geheime sleutel voor de eigen login (sessies) en voor upload-tickets bij
  // opslag in de database of een map. Minstens 32 tekens, willekeurig.
  BETTER_AUTH_SECRET: z.preprocess(leegIsOngezet, z.string().min(32, "moet minstens 32 tekens lang zijn").optional()),

  // Migraties automatisch uitvoeren bij het opstarten (nooit bij Supabase).
  DB_AUTO_MIGRATE: z.preprocess(leegIsOngezet, z.enum(["true", "false"]).default("false")),

  SITE_URL: z.preprocess(leegIsOngezet, z.string().url().optional()),
  NEXT_PUBLIC_SITE_URL: z.preprocess(leegIsOngezet, z.string().url().optional()),
});

// Alleen gelezen bij DB_DIALECT=mssql, met een eigen schema: een fout in een
// MSSQL_*-variabele mag een Postgres-installatie nooit raken.
const mssqlSchema = z.object({
  // Zoals uit SSMS gekopieerd: host, host\INSTANTIE, host,1433 of tcp:host,1433.
  MSSQL_SERVER: z.preprocess(leegIsOngezet, z.string().trim().min(1).optional()),
  MSSQL_PORT: z.preprocess(leegIsOngezet, z.coerce.number().int().min(1).max(65535).optional()),
  MSSQL_INSTANCE: z.preprocess(leegIsOngezet, z.string().trim().min(1).optional()),
  MSSQL_DATABASE: z.preprocess(leegIsOngezet, z.string().trim().min(1).optional()),
  MSSQL_AUTH: z.preprocess(leegIsOngezet, z.enum(["sql", "ntlm", "azure-default"]).default("sql")),
  MSSQL_USER: z.preprocess(leegIsOngezet, z.string().optional()),
  MSSQL_PASSWORD: z.preprocess(leegIsOngezet, z.string().optional()),
  MSSQL_DOMAIN: z.preprocess(leegIsOngezet, z.string().trim().min(1).optional()),
  MSSQL_AZURE_CLIENT_ID: z.preprocess(leegIsOngezet, z.string().trim().min(1).optional()),
  // "strict" = TDS 8 (SQL Server 2022+ en Azure SQL): TLS vóór het aanmelden.
  MSSQL_ENCRYPT: z.preprocess(leegIsOngezet, z.enum(["true", "false", "strict"]).default("true")),
  MSSQL_TRUST_SERVER_CERT: z.preprocess(leegIsOngezet, z.enum(["true", "false"]).optional()),
  MSSQL_CA: z.preprocess(leegIsOngezet, z.string().optional()),
  MSSQL_TLS_SERVERNAME: z.preprocess(leegIsOngezet, z.string().trim().min(1).optional()),
});

export type PostgresDbConfig = {
  dialect: "postgres";
  url: string;
  poolMax: number;
  ssl: false | { rejectUnauthorized: boolean; ca?: string };
};

export type MssqlAuth =
  | { type: "sql"; user: string; password: string }
  | { type: "ntlm"; domain: string; user: string; password: string }
  | { type: "azure-default"; clientId?: string };

export type MssqlDbConfig = {
  dialect: "mssql";
  server: string;
  port?: number;
  instanceName?: string;
  database: string;
  auth: MssqlAuth;
  encrypt: boolean | "strict";
  trustServerCertificate: boolean;
  tlsServerName?: string;
  ca?: string;
  poolMax: number;
};

export type DbConfig = PostgresDbConfig | MssqlDbConfig;

export type AppConfig = {
  db: DbConfig;
  auth: { driver: "supabase" | "local"; registratie: "open" | "uitnodiging" };
  storage: { driver: "supabase" | "database" | "filesystem"; dir?: string };
  /** Alleen gezet waar nodig: eigen login of opslag in database/map. */
  secret: string | undefined;
  autoMigrate: boolean;
  siteUrl: string | undefined;
};

export class ConfigFout extends Error {
  constructor(bericht: string) {
    super(`Configuratiefout: ${bericht}`);
    this.name = "ConfigFout";
  }
}

type SslModus = "verify" | "no-verify" | "off";

// TLS-parameters in de URL (bv. ?sslmode=require uit een handleiding of de
// Vercel-integratie) zouden in pg de ssl-optie stilzwijgend overschrijven.
// Daarom gaan ze uit de URL; sslmode telt alleen als DATABASE_SSL niet gezet is.
const SSL_PARAMS = ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey", "sslnegotiation", "uselibpqcompat"];

function sslModusUitUrl(sslmode: string | null): SslModus | undefined {
  if (!sslmode) return undefined;
  if (sslmode === "disable") return "off";
  if (sslmode === "verify-ca" || sslmode === "verify-full") return "verify";
  return "no-verify";
}

function normaliseerDatabaseUrl(raw: string): { url: string; sslmode: string | null } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ConfigFout("DATABASE_URL is geen geldige URL");
  }
  const sslmode = u.searchParams.get("sslmode");
  for (const p of SSL_PARAMS) u.searchParams.delete(p);
  return { url: u.toString(), sslmode };
}

/** Een CA-certificaat mag als PEM-tekst of als base64 in de env staan. */
function leesPem(ca: string | undefined): string | undefined {
  return ca && !ca.includes("BEGIN CERTIFICATE") ? Buffer.from(ca, "base64").toString("utf8") : ca;
}

function sslInstelling(url: string, modus: SslModus | undefined, ca: string | undefined): PostgresDbConfig["ssl"] {
  const host = new URL(url).hostname;
  const lokaal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  const effectief = modus ?? (lokaal ? "off" : "no-verify");
  if (effectief === "off") return false;
  if (effectief === "verify") {
    // Zonder CA gelden de standaard vertrouwde certificaten van Node.
    const pem = leesPem(ca);
    return pem ? { rejectUnauthorized: true, ca: pem } : { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

const isLoopback = (host: string) =>
  ["localhost", "::1", "[::1]"].includes(host.toLowerCase()) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);

/**
 * MSSQL_SERVER zoals SSMS het toont: `host`, `host\INSTANTIE`, `host,1433` of
 * `tcp:host,1433`. Named pipes en shared memory kan tedious niet.
 */
function ontleedMssqlServer(waarde: string): { host: string; port?: number; instance?: string } {
  let rest = waarde.trim();
  const protocol = /^(tcp|np|lpc|admin):/i.exec(rest);
  if (protocol) {
    if (protocol[1].toLowerCase() !== "tcp") {
      throw new ConfigFout(`MSSQL_SERVER: alleen TCP-verbindingen worden ondersteund (geen ${protocol[1]}:)`);
    }
    rest = rest.slice(protocol[0].length);
  } else if (rest.includes("://")) {
    throw new ConfigFout("MSSQL_SERVER: geef een servernaam, geen URL (bv. sqlsrv01 of sqlsrv01,1433)");
  }
  let port: number | undefined;
  const komma = rest.lastIndexOf(",");
  if (komma >= 0) {
    const poort = rest.slice(komma + 1).trim();
    if (!/^\d{1,5}$/.test(poort) || Number(poort) < 1 || Number(poort) > 65535) {
      throw new ConfigFout("MSSQL_SERVER: na de komma hoort een poortnummer (bv. sqlsrv01,1433)");
    }
    port = Number(poort);
    rest = rest.slice(0, komma).trim();
  }
  let instance: string | undefined;
  const schuin = rest.indexOf("\\");
  if (schuin >= 0) {
    instance = rest.slice(schuin + 1).trim();
    rest = rest.slice(0, schuin).trim();
    if (!instance || instance.includes("\\")) {
      throw new ConfigFout("MSSQL_SERVER: ongeldige instantienaam (verwacht host\\INSTANTIE)");
    }
  }
  if (!rest || /[\s/]/.test(rest)) {
    throw new ConfigFout("MSSQL_SERVER: ongeldige servernaam");
  }
  return { host: rest, port, instance };
}

function leesMssqlConfig(env: Record<string, string | undefined>, poolMax: number): MssqlDbConfig {
  if (env.VERCEL) {
    throw new ConfigFout(
      "SQL Server wordt op Vercel niet ondersteund; host de kennisbank zelf (Docker of Windows-dienst)"
    );
  }
  const parsed = mssqlSchema.safeParse(env);
  if (!parsed.success) {
    const fout = parsed.error.issues[0];
    throw new ConfigFout(`${fout.path.join(".")}: ${fout.message}`);
  }
  const m = parsed.data;

  if (!m.MSSQL_SERVER) throw new ConfigFout("MSSQL_SERVER ontbreekt (de naam of het adres van de SQL Server)");
  if (!m.MSSQL_DATABASE) throw new ConfigFout("MSSQL_DATABASE ontbreekt (de naam van de database)");

  const server = ontleedMssqlServer(m.MSSQL_SERVER);
  if (server.port !== undefined && m.MSSQL_PORT !== undefined && server.port !== m.MSSQL_PORT) {
    throw new ConfigFout("MSSQL_SERVER en MSSQL_PORT noemen een verschillende poort");
  }
  if (server.instance && m.MSSQL_INSTANCE && server.instance.toLowerCase() !== m.MSSQL_INSTANCE.toLowerCase()) {
    throw new ConfigFout("MSSQL_SERVER en MSSQL_INSTANCE noemen een verschillende instantie");
  }
  const port = server.port ?? m.MSSQL_PORT;
  const instanceName = server.instance ?? m.MSSQL_INSTANCE;
  if (port !== undefined && instanceName) {
    throw new ConfigFout(
      "Geef een poort óf een instantienaam op, niet allebei (een vaste poort is aanbevolen; een instantie gebruikt SQL Browser op UDP 1434)"
    );
  }

  let auth: MssqlAuth;
  if (m.MSSQL_AUTH === "azure-default") {
    if (m.MSSQL_ENCRYPT === "false") {
      throw new ConfigFout("MSSQL_AUTH=azure-default kan niet met MSSQL_ENCRYPT=false");
    }
    auth = m.MSSQL_AZURE_CLIENT_ID ? { type: "azure-default", clientId: m.MSSQL_AZURE_CLIENT_ID } : { type: "azure-default" };
  } else if (m.MSSQL_AUTH === "ntlm") {
    // DOMEIN\naam in MSSQL_USER mag ook (zo staat een Windows-account in SSMS).
    let user = m.MSSQL_USER?.trim();
    let domain = m.MSSQL_DOMAIN;
    const schuin = user?.indexOf("\\") ?? -1;
    if (user && schuin >= 0) {
      const uitNaam = user.slice(0, schuin).trim();
      user = user.slice(schuin + 1).trim();
      if (domain && domain.toLowerCase() !== uitNaam.toLowerCase()) {
        throw new ConfigFout("MSSQL_DOMAIN en het domein in MSSQL_USER (DOMEIN\\naam) verschillen");
      }
      domain = uitNaam;
    }
    if (!domain || !user || !m.MSSQL_PASSWORD) {
      throw new ConfigFout(
        "MSSQL_AUTH=ntlm vraagt MSSQL_DOMAIN, MSSQL_USER en MSSQL_PASSWORD (of MSSQL_USER als DOMEIN\\naam)"
      );
    }
    auth = { type: "ntlm", domain, user, password: m.MSSQL_PASSWORD };
  } else {
    const user = m.MSSQL_USER?.trim();
    if (!user || !m.MSSQL_PASSWORD) {
      throw new ConfigFout("MSSQL_USER en MSSQL_PASSWORD ontbreken (de SQL Server-login van de kennisbank)");
    }
    if (user.includes("\\")) {
      // Een SQL-login kan geen backslash bevatten: dit is een Windows-account.
      throw new ConfigFout("MSSQL_USER is een Windows-account (DOMEIN\\naam): gebruik MSSQL_AUTH=ntlm");
    }
    auth = { type: "sql", user, password: m.MSSQL_PASSWORD };
  }

  const encrypt = m.MSSQL_ENCRYPT === "strict" ? "strict" : m.MSSQL_ENCRYPT === "true";
  const ca = leesPem(m.MSSQL_CA);
  if (encrypt === "strict" && m.MSSQL_TRUST_SERVER_CERT === "true") {
    throw new ConfigFout(
      "MSSQL_ENCRYPT=strict kan niet met MSSQL_TRUST_SERVER_CERT=true: strict controleert het certificaat altijd"
    );
  }
  if (ca && m.MSSQL_TRUST_SERVER_CERT === "true") {
    throw new ConfigFout(
      "MSSQL_CA heeft geen zin met MSSQL_TRUST_SERVER_CERT=true (dan wordt het certificaat niet gecontroleerd)"
    );
  }
  // De naam in het certificaat dient alleen om het certificaat te controleren.
  if (m.MSSQL_TLS_SERVERNAME && m.MSSQL_TRUST_SERVER_CERT === "true") {
    throw new ConfigFout(
      "MSSQL_TLS_SERVERNAME heeft geen zin met MSSQL_TRUST_SERVER_CERT=true (dan wordt het certificaat niet gecontroleerd)"
    );
  }
  if (encrypt === false && !isLoopback(server.host)) {
    throw new ConfigFout(
      "MSSQL_ENCRYPT=false mag alleen voor een server op deze machine (localhost): anders gaat het wachtwoord onversleuteld over het netwerk"
    );
  }
  // Standaard vertrouwen (zoals DATABASE_SSL=no-verify bij Postgres), behalve
  // als er een CA of TLS-servernaam is opgegeven of strict gevraagd is: dan
  // wordt er gecontroleerd.
  const trustServerCertificate =
    m.MSSQL_TRUST_SERVER_CERT !== undefined
      ? m.MSSQL_TRUST_SERVER_CERT === "true"
      : !ca && !m.MSSQL_TLS_SERVERNAME && encrypt !== "strict";

  return {
    dialect: "mssql",
    server: server.host,
    ...(port !== undefined ? { port } : {}),
    ...(instanceName ? { instanceName } : {}),
    database: m.MSSQL_DATABASE,
    auth,
    encrypt,
    trustServerCertificate,
    ...(m.MSSQL_TLS_SERVERNAME ? { tlsServerName: m.MSSQL_TLS_SERVERNAME } : {}),
    ...(ca ? { ca } : {}),
    poolMax,
  };
}

export function leesConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fout = parsed.error.issues[0];
    throw new ConfigFout(`${fout.path.join(".")}: ${fout.message}`);
  }
  const e = parsed.data;

  if (e.AUTH_DRIVER === "supabase" && e.DB_DIALECT !== "postgres") {
    throw new ConfigFout("AUTH_DRIVER=supabase kan alleen met DB_DIALECT=postgres");
  }
  if (e.STORAGE_DRIVER === "supabase" && e.AUTH_DRIVER !== "supabase") {
    throw new ConfigFout("STORAGE_DRIVER=supabase kan alleen met AUTH_DRIVER=supabase");
  }
  if (e.STORAGE_DRIVER === "filesystem" && !e.STORAGE_DIR) {
    throw new ConfigFout("STORAGE_DRIVER=filesystem vraagt ook STORAGE_DIR");
  }
  if (e.STORAGE_DRIVER === "filesystem" && !path.isAbsolute(e.STORAGE_DIR!)) {
    // Een relatief pad komt in .next/standalone terecht (de server doet daar
    // een chdir), en die map wist de volgende build.
    throw new ConfigFout(
      "STORAGE_DIR moet een absoluut pad zijn, buiten de map van de code (bv. D:\\kennisbank\\bestanden of /var/lib/kennisbank/bestanden)"
    );
  }
  if (e.STORAGE_DRIVER === "filesystem" && env.VERCEL) {
    throw new ConfigFout("STORAGE_DRIVER=filesystem werkt niet op Vercel (de schijf is daar tijdelijk)");
  }
  if (e.STORAGE_DRIVER === "database" && e.AUTH_DRIVER === "supabase") {
    // De tabel files bestaat alleen in installaties die `npm run db:migrate` gebruiken.
    throw new ConfigFout("STORAGE_DRIVER=database kan alleen met de eigen login (AUTH_DRIVER=local)");
  }
  // SQL Server: eigen variabelen (MSSQL_*), DATABASE_URL telt dan niet.
  const mssql = e.DB_DIALECT === "mssql" ? leesMssqlConfig(env, e.DATABASE_POOL_MAX) : undefined;
  if (!mssql && !e.DATABASE_URL) {
    throw new ConfigFout("DATABASE_URL ontbreekt");
  }

  const siteUrl = (e.SITE_URL ?? e.NEXT_PUBLIC_SITE_URL)?.replace(/\/$/, "");
  const eigenOpslag = e.STORAGE_DRIVER === "database" || e.STORAGE_DRIVER === "filesystem";
  if ((e.AUTH_DRIVER === "local" || eigenOpslag) && !e.BETTER_AUTH_SECRET) {
    throw new ConfigFout(
      "BETTER_AUTH_SECRET ontbreekt (nodig voor de eigen login en voor opslag in de database of een map)"
    );
  }
  if (e.AUTH_DRIVER === "local" && !siteUrl) {
    throw new ConfigFout("SITE_URL ontbreekt (het publieke adres van deze installatie, bv. https://kennis.voorbeeld.be)");
  }

  let db: DbConfig;
  if (mssql) {
    db = mssql;
  } else {
    const { url, sslmode } = normaliseerDatabaseUrl(e.DATABASE_URL!);
    const sslModus = e.DATABASE_SSL ?? sslModusUitUrl(sslmode);
    db = {
      dialect: "postgres",
      url,
      poolMax: e.DATABASE_POOL_MAX,
      ssl: sslInstelling(url, sslModus, e.DATABASE_SSL_CA),
    };
  }

  return {
    db,
    auth: { driver: e.AUTH_DRIVER, registratie: e.REGISTRATIE },
    storage: { driver: e.STORAGE_DRIVER, dir: e.STORAGE_DIR },
    secret: e.BETTER_AUTH_SECRET,
    autoMigrate: e.DB_AUTO_MIGRATE === "true",
    siteUrl,
  };
}

let cache: AppConfig | undefined;

/** De configuratie van deze installatie (één keer gelezen en gevalideerd). */
export function getConfig(): AppConfig {
  cache ??= leesConfig();
  return cache;
}
