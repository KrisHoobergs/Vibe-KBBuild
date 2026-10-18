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

  SITE_URL: z.preprocess(leegIsOngezet, z.string().url().optional()),
  NEXT_PUBLIC_SITE_URL: z.preprocess(leegIsOngezet, z.string().url().optional()),
});

export type DbConfig = {
  dialect: "postgres";
  url: string;
  poolMax: number;
  ssl: false | { rejectUnauthorized: boolean; ca?: string };
};

export type AppConfig = {
  db: DbConfig;
  auth: { driver: "supabase" | "local"; registratie: "open" | "uitnodiging" };
  storage: { driver: "supabase" | "database" | "filesystem"; dir?: string };
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

function sslInstelling(url: string, modus: SslModus | undefined, ca: string | undefined): DbConfig["ssl"] {
  const host = new URL(url).hostname;
  const lokaal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  const effectief = modus ?? (lokaal ? "off" : "no-verify");
  if (effectief === "off") return false;
  if (effectief === "verify") {
    // De CA mag als PEM-tekst of base64 in de env staan.
    // Zonder CA gelden de standaard vertrouwde certificaten van Node.
    const pem = ca && !ca.includes("BEGIN CERTIFICATE") ? Buffer.from(ca, "base64").toString("utf8") : ca;
    return pem ? { rejectUnauthorized: true, ca: pem } : { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
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
  if (e.DB_DIALECT === "mssql") {
    throw new ConfigFout("SQL Server wordt nog niet ondersteund");
  }
  if (e.AUTH_DRIVER === "local") {
    throw new ConfigFout("De eigen login (AUTH_DRIVER=local) wordt nog niet ondersteund");
  }
  if (!e.DATABASE_URL) {
    throw new ConfigFout("DATABASE_URL ontbreekt");
  }

  const { url, sslmode } = normaliseerDatabaseUrl(e.DATABASE_URL);
  const sslModus = e.DATABASE_SSL ?? sslModusUitUrl(sslmode);

  return {
    db: {
      dialect: "postgres",
      url,
      poolMax: e.DATABASE_POOL_MAX,
      ssl: sslInstelling(url, sslModus, e.DATABASE_SSL_CA),
    },
    auth: { driver: e.AUTH_DRIVER, registratie: e.REGISTRATIE },
    storage: { driver: e.STORAGE_DRIVER, dir: e.STORAGE_DIR },
    siteUrl: e.SITE_URL ?? e.NEXT_PUBLIC_SITE_URL,
  };
}

let cache: AppConfig | undefined;

/** De configuratie van deze installatie (één keer gelezen en gevalideerd). */
export function getConfig(): AppConfig {
  cache ??= leesConfig();
  return cache;
}
