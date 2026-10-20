// Kleine hulpfuncties voor de verschillen tussen Postgres en SQL Server, zodat
// de repositories zelf dialect-neutraal blijven.

/**
 * De afzonderlijke fouten in een fout. Kysely-mssql geeft bij meerdere
 * serverfouten een array (mssql-driver.js), soms is het een AggregateError.
 * Een gewone fout (zoals elke Postgres-fout) wordt een lijst van één.
 */
export function losseFouten(err: unknown): unknown[] {
  if (Array.isArray(err)) return err;
  if (err instanceof AggregateError) return err.errors;
  return [err];
}

/** De SQL Server-foutnummers (`number`) in een fout; leeg voor Postgres-fouten. */
export function foutNummers(err: unknown): number[] {
  return losseFouten(err)
    .map((e) => (e && typeof e === "object" ? (e as { number?: unknown }).number : undefined))
    .filter((n): n is number => typeof n === "number");
}

/** Schending van een UNIQUE-constraint (Postgres 23505, SQL Server 2627/2601). */
export function isUniqueViolation(err: unknown): boolean {
  return losseFouten(err).some((f) => {
    if (!f || typeof f !== "object") return false;
    const e = f as { code?: unknown; number?: unknown };
    return e.code === "23505" || e.number === 2627 || e.number === 2601;
  });
}

/**
 * Alleen SQL Server: deze sessie was het slachtoffer van een deadlock (1205).
 * Postgres-codes (40P01) bewust niet: het gedrag daar blijft ongewijzigd.
 */
export function isMssqlDeadlock(err: unknown): boolean {
  return foutNummers(err).includes(1205);
}

/** Tijdstip uit de database → ISO-string, zoals de types in src/types verwachten. */
export function toIso(v: Date | string): string;
export function toIso(v: Date | string | null): string | null;
export function toIso(v: Date | string | null): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/** JSON-kolom: Postgres geeft al een object, SQL Server een string. */
export function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}
