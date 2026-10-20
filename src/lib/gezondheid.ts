import "server-only";
import { sql } from "kysely";
import { leesConfig } from "@/lib/config";
import { maakKysely } from "@/lib/db/connection";
import { leesOpstartstatus, veiligeFoutmelding } from "@/lib/db/opstartstatus";
import { beoordeelMssqlControles, leesMssqlControles } from "@/lib/db/mssql-controles";
import { isGeldigeMailsleutel } from "@/lib/crypto";

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
  /** null: geen MAIL_ENCRYPTION_KEY (artikels mailen staat dan uit). */
  mailsleutel: Controle | null;
  /**
   * Alleen op SQL Server (en alleen als de database bereikbaar is): de manier
   * van zoeken en wat de app wel laat werken, maar met minder. Bewust zonder
   * versie of collatie (die toont alleen npm run db:mssql:controle).
   */
  sqlServer?: { zoeken: "full-text" | "eenvoudig"; waarschuwingen: string[] };
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
  let sqlServer: Gezondheid["sqlServer"];
  if (config) {
    // Eigen, kortlevende verbinding: werkt ook als de gedeelde pool vastzit.
    const { db } = maakKysely({ ...config.db, poolMax: 1 });
    try {
      await sql`SELECT 1`.execute(db);
      database = { ok: true };
      if (config.db.dialect === "mssql") {
        // Serverinstellingen die opslaan onbetrouwbaar maken (NOCOUNT) of een
        // te oude versie zijn fataal; de rest is een waarschuwing.
        const { fataal, waarschuwingen, zoeken } = beoordeelMssqlControles(await leesMssqlControles(db));
        if (fataal.length) database = { ok: false, melding: fataal.join("; ") };
        sqlServer = { zoeken, waarschuwingen };
      }
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
      : opstart.migraties === "niet-automatisch"
        ? { status: opstart.migraties, melding: opstart.reden }
        : { status: opstart.migraties };

  // Alleen bekijken als de sleutel er is: zonder sleutel kan mailen gewoon niet.
  const mailsleutel: Controle | null = process.env.MAIL_ENCRYPTION_KEY
    ? isGeldigeMailsleutel()
      ? { ok: true }
      : { ok: false, melding: "MAIL_ENCRYPTION_KEY is geen base64-sleutel van 32 bytes" }
    : null;

  return {
    gezond: configuratie.ok && !!database?.ok && migraties.status !== "fout" && mailsleutel?.ok !== false,
    installatie: config && {
      database: config.db.dialect,
      login: config.auth.driver,
      opslag: config.storage.driver,
      registratie: config.auth.driver === "local" ? config.auth.registratie : undefined,
    },
    configuratie,
    database,
    migraties,
    mailsleutel,
    // Op Postgres ontbreekt de sleutel helemaal: dezelfde JSON als voorheen.
    ...(sqlServer ? { sqlServer } : {}),
  };
}
