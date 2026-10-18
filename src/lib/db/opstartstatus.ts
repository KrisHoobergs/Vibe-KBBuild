// Uitkomst van het automatisch migreren bij het opstarten (instrumentation.ts),
// zodat /api/gezondheid kan tonen wat er misging. Op globalThis, omdat
// instrumentation en de routes in verschillende bundels zitten.

export type Opstartstatus =
  | { migraties: "niet-automatisch" }
  | { migraties: "ok"; uitgevoerd: string[] }
  | { migraties: "fout"; melding: string };

const globaal = globalThis as unknown as { __kbOpstart?: Opstartstatus };

export function zetOpstartstatus(status: Opstartstatus) {
  globaal.__kbOpstart = status;
}

export function leesOpstartstatus(): Opstartstatus {
  return globaal.__kbOpstart ?? { migraties: "niet-automatisch" };
}

/**
 * Een foutmelding zonder geheimen: soort fout, code en de tekst, waaruit alles
 * wat op een verbindingsadres, host, e-mailadres of IP-adres lijkt, gewist is.
 */
export function veiligeFoutmelding(error: unknown): string {
  if (error instanceof Error && error.name === "ConfigFout") return error.message;
  const e = error as { code?: unknown; name?: unknown; message?: unknown };
  const code = typeof e?.code === "string" || typeof e?.code === "number" ? String(e.code) : null;
  const naam = typeof e?.name === "string" ? e.name : "Error";
  const tekst =
    typeof e?.message === "string"
      ? e.message
          .replace(/\S+:\/\/\S+/g, "[adres]")
          .replace(/\S+@\S+/g, "[adres]")
          .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[ip]")
          .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+){2,}\b/gi, "[host]")
          .slice(0, 200)
      : "";
  return `${naam}${code ? ` (code ${code})` : ""}${tekst ? `: ${tekst}` : ""}`;
}
