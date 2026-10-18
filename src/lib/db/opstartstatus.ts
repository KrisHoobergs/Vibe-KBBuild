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

/** Een foutmelding zonder geheimen: alleen de soort fout en een code. */
export function veiligeFoutmelding(error: unknown): string {
  if (error instanceof Error && error.name === "ConfigFout") return error.message;
  const e = error as { code?: unknown; name?: unknown };
  const code = typeof e?.code === "string" || typeof e?.code === "number" ? String(e.code) : null;
  const naam = typeof e?.name === "string" ? e.name : "Error";
  return code ? `${naam} (code ${code})` : naam;
}
