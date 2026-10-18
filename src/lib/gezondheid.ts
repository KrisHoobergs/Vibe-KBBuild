import "server-only";
import { sql } from "kysely";
import { leesConfig } from "@/lib/config";
import { maakKysely } from "@/lib/db/connection";
import { leesOpstartstatus, veiligeFoutmelding } from "@/lib/db/opstartstatus";

// Gezondheid van deze installatie: klopt de configuratie, is de database
// bereikbaar, zijn de migraties bij het opstarten gelukt? Gebruikt door
// /status (voor mensen) en /api/gezondheid (voor tools). Bevat nooit waarden
// of geheimen: alleen namen van instellingen en ontsmette foutmeldingen.

export type Controle = { ok: boolean; melding?: string };

export type Gezondheid = {
  gezond: boolean;
  installatie?: { database: string; login: string; opslag: string; registratie?: string };
  configuratie: Controle;
  database: Controle | null;
  migraties: { status: "ok" | "fout" | "niet-automatisch"; melding?: string };
};

export async function controleerGezondheid(): Promise<Gezondheid> {
  let config;
  let configuratie: Controle;
  try {
    config = leesConfig();
    configuratie = { ok: true };
  } catch (error) {
    configuratie = { ok: false, melding: veiligeFoutmelding(error) };
  }

  let database: Controle | null = null;
  if (config) {
    // Eigen, kortlevende verbinding: werkt ook als de gedeelde pool vastzit.
    const { db } = maakKysely({ ...config.db, poolMax: 1 });
    try {
      await sql`SELECT 1`.execute(db);
      database = { ok: true };
    } catch (error) {
      database = { ok: false, melding: veiligeFoutmelding(error) };
    } finally {
      await db.destroy().catch(() => {});
    }
  }

  const opstart = leesOpstartstatus();
  const migraties =
    opstart.migraties === "fout"
      ? { status: "fout" as const, melding: opstart.melding }
      : { status: opstart.migraties };

  return {
    gezond: configuratie.ok && !!database?.ok && migraties.status !== "fout",
    installatie: config && {
      database: config.db.dialect,
      login: config.auth.driver,
      opslag: config.storage.driver,
      registratie: config.auth.driver === "local" ? config.auth.registratie : undefined,
    },
    configuratie,
    database,
    migraties,
  };
}
