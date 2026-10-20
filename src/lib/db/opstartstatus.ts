// Uitkomst van het automatisch migreren bij het opstarten (instrumentation.ts),
// zodat /api/gezondheid kan tonen wat er misging. Op globalThis, omdat
// instrumentation en de routes in verschillende bundels zitten.

import { losseFouten } from "./dialect";

export type Opstartstatus =
  | { migraties: "niet-automatisch"; reden?: string }
  | { migraties: "ok"; uitgevoerd: string[] }
  | { migraties: "fout"; melding: string };

const globaal = globalThis as unknown as { __kbOpstart?: Opstartstatus };

export function zetOpstartstatus(status: Opstartstatus) {
  globaal.__kbOpstart = status;
}

export function leesOpstartstatus(): Opstartstatus {
  return globaal.__kbOpstart ?? { migraties: "niet-automatisch" };
}

/** Hoeveel losse fouten (SQL Server geeft er soms meerdere tegelijk) we tonen. */
const MAX_FOUTEN = 3;

// Foutcodes van tedious, de SQL Server-driver. Geen enkele komt van pg.
const TEDIOUS_CODES = new Set([
  "ESOCKET",
  "ETIMEOUT",
  "ELOGIN",
  "EINSTLOOKUP",
  "ECLOSE",
  "EREQUEST",
  "EENCRYPT",
  "EFEDAUTH",
  "ECANCEL",
  "EINVALIDSTATE",
]);

/**
 * Een fout van tedious (SQL Server): een tedious-code, of een numeriek
 * SQL Server-foutnummer. pg-fouten hebben nooit een `number`.
 */
function isTediousFout(f: unknown): boolean {
  if (!f || typeof f !== "object") return false;
  const e = f as { code?: unknown; number?: unknown };
  return (typeof e.code === "string" && TEDIOUS_CODES.has(e.code)) || typeof e.number === "number";
}

/**
 * Wist uit een tedious-melding wat de algemene regels niet vangen: de
 * servernaam zonder punten (sqlsrv01), host\INSTANTIE, de gebruiker bij een
 * mislukte aanmelding, database- en servernamen tussen aanhalingstekens
 * (4060 `Cannot open database "x"`, 262 `… in database 'x'`, 229, Azure 40613
 * `Database 'x' on server 'y'`, 40615/40532 `Cannot open server 'y'`) en de
 * namen in een certificaatfout.
 */
function ontsmetTedious(tekst: string): string {
  return tekst
    .replace(/Failed to connect to \S+/g, "Failed to connect to [server]")
    .replace(/redirected from [^\s)]+/g, "redirected from [server]")
    .replace(/Failed to get response from SQL Server Browser on \S+/g, "Failed to get response from SQL Server Browser on [server]")
    .replace(/Port for \S+ not found in \S+/g, "Port for [instantie] not found in [server]")
    .replace(/Login failed for user '[^']*'/g, "Login failed for user '[gebruiker]'")
    .replace(
      /\b(database|server) ('[^']*'|"[^"]*")/gi,
      (_, woord: string, naam: string) => `${woord} ${naam[0]}[${woord.toLowerCase()}]${naam[0]}`
    )
    .replace(/\b(connect|getaddrinfo) (E[A-Z_]+) \S+/g, "$1 $2 [server]")
    .replace(/\b(Host|IP): \S+ (is not (?:in the cert's (?:altnames|list)|cert's CN)):.*/g, "$1: [server] $2: [certificaat]")
    .replace(/\b[\w.-]+\\[\w$]+\b/g, "[server]");
}

/** Eén fout als tekst: soort, code (en SQL Server-nummer) en de ontsmette tekst. */
function eenMelding(error: unknown): string {
  const e = error as { code?: unknown; name?: unknown; message?: unknown; number?: unknown };
  const tedious = isTediousFout(error);
  const code = typeof e?.code === "string" || typeof e?.code === "number" ? String(e.code) : null;
  const nummer = typeof e?.number === "number" ? e.number : null;
  const naam = typeof e?.name === "string" ? e.name : "Error";
  const tekst =
    typeof e?.message === "string"
      ? (tedious ? ontsmetTedious(e.message) : e.message)
          .replace(/\S+:\/\/\S+/g, "[adres]")
          .replace(/\S+@\S+/g, "[adres]")
          .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[ip]")
          .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+){2,}\b/gi, "[host]")
          .slice(0, 200)
      : "";
  const kenmerken = [code ? `code ${code}` : null, nummer !== null ? `nr ${nummer}` : null].filter(Boolean);
  return `${naam}${kenmerken.length ? ` (${kenmerken.join(", ")})` : ""}${tekst ? `: ${tekst}` : ""}`;
}

/**
 * Een foutmelding zonder geheimen: soort fout, code en de tekst, waaruit alles
 * wat op een verbindingsadres, host, e-mailadres of IP-adres lijkt, gewist is.
 *
 * SQL Server: Kysely geeft meerdere serverfouten als array (bv. 1505 + 1750);
 * we tonen er hoogstens drie, gescheiden door " | ". Een AggregateError wordt
 * alleen uitgepakt als er tedious-fouten in zitten: pg geeft bij ECONNREFUSED
 * op localhost zelf een AggregateError, en die melding blijft zoals ze was.
 */
export function veiligeFoutmelding(error: unknown): string {
  if (error instanceof Error && error.name === "ConfigFout") return error.message;
  const fouten = losseFouten(error);
  if (!Array.isArray(error) && !fouten.some(isTediousFout)) return eenMelding(error);
  if (fouten.length === 0) return eenMelding(undefined);
  const meldingen = fouten.slice(0, MAX_FOUTEN).map(eenMelding);
  if (fouten.length > MAX_FOUTEN) meldingen.push(`… en ${fouten.length - MAX_FOUTEN} meer`);
  return meldingen.join(" | ");
}
