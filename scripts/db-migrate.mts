/**
 * Databasemigraties voor installaties ZONDER Supabase (gewone PostgreSQL of
 * SQL Server, volgens DB_DIALECT). Leest de configuratie uit de omgeving (en
 * .env.local als die bestaat; bestaande omgevingsvariabelen gaan voor).
 *
 *   npm run db:migrate
 *
 * Weigert bij AUTH_DRIVER=supabase, bij een Supabase-URL en bij een database
 * die zelf Supabase-tabellen heeft. SQL Server: zonder Full-Text Search wordt
 * 0005_fulltext overgeslagen (en later opnieuw geprobeerd).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { voerMigratiesUit } from "../src/lib/db/auto-migrate";

const env = path.resolve(import.meta.dirname, "..", ".env.local");
if (existsSync(env)) process.loadEnvFile(env);

try {
  const uitgevoerd = await voerMigratiesUit();
  console.log(uitgevoerd.length ? `Klaar: ${uitgevoerd.join(", ")}` : "Database is al bijgewerkt.");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
