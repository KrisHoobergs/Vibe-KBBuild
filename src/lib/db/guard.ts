// Harde beveiliging: de bestaande productie-database (Supabase-project KBBuild)
// mag nooit door een migratie of een lokaal script gewijzigd worden. Deze check
// heeft bewust geen override-vlag.

const PRODUCTIE_PROJECT_REF = "bhghmdfcbwfyzbtvimnt";

const SUPABASE_HOSTS = ["supabase.co", "supabase.com", "pooler.supabase.com"];

export class ProductieDatabaseFout extends Error {
  constructor(reden: string) {
    super(
      `Geweigerd: ${reden}. Migraties en lokale scripts mogen nooit tegen een Supabase-database draaien.`
    );
    this.name = "ProductieDatabaseFout";
  }
}

/** Gooit een fout als de verbinding naar Supabase (of het productieproject) wijst. */
export function assertGeenSupabaseDatabase(connectionString: string | undefined | null) {
  if (!connectionString) return;
  const lower = connectionString.toLowerCase();

  if (lower.includes(PRODUCTIE_PROJECT_REF)) {
    throw new ProductieDatabaseFout("de verbinding bevat het productie-project-ref");
  }

  let host = "";
  try {
    host = new URL(connectionString).hostname.toLowerCase();
  } catch {
    // Geen URL (bv. een MSSQL-hostnaam): controleer de hele string.
    host = lower;
  }

  if (SUPABASE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h))) {
    throw new ProductieDatabaseFout(`host ${host} is een Supabase-host`);
  }
}

/** Voor de lokale testdatabase: alleen localhost is toegestaan. */
export function assertLokaleDatabase(connectionString: string) {
  assertGeenSupabaseDatabase(connectionString);
  const host = new URL(connectionString).hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new ProductieDatabaseFout(`host ${host} is niet lokaal`);
  }
}
