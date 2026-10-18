// Kleine hulpfuncties voor de verschillen tussen Postgres en SQL Server, zodat
// de repositories zelf dialect-neutraal blijven.

/** Schending van een UNIQUE-constraint (Postgres 23505, SQL Server 2627/2601). */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; number?: unknown };
  return e.code === "23505" || e.number === 2627 || e.number === 2601;
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
