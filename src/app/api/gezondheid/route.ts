import { sql } from "kysely";
import { NextResponse } from "next/server";
import { leesConfig } from "@/lib/config";
import { maakKysely } from "@/lib/db/connection";
import { leesOpstartstatus, veiligeFoutmelding } from "@/lib/db/opstartstatus";

// Gezondheid van deze installatie, voor wie haar opzet of beheert: klopt de
// configuratie, is de database bereikbaar, zijn de migraties gelukt? Bewust
// zonder login (ook als de login zelf stuk is), en daarom zonder waarden of
// geheimen: alleen namen van instellingen en foutcodes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const antwoord: Record<string, unknown> = {};

  let config;
  try {
    config = leesConfig();
    antwoord.installatie = {
      database: config.db.dialect,
      login: config.auth.driver,
      opslag: config.storage.driver,
      registratie: config.auth.driver === "local" ? config.auth.registratie : undefined,
    };
    antwoord.configuratie = "ok";
  } catch (error) {
    antwoord.configuratie = `fout: ${veiligeFoutmelding(error)}`;
  }

  if (config) {
    // Eigen, kortlevende verbinding: werkt ook als de gedeelde pool vastzit.
    const { db } = maakKysely({ ...config.db, poolMax: 1 });
    try {
      await sql`SELECT 1`.execute(db);
      antwoord.database = "ok";
    } catch (error) {
      antwoord.database = `fout: ${veiligeFoutmelding(error)}`;
    } finally {
      await db.destroy().catch(() => {});
    }
  }

  const opstart = leesOpstartstatus();
  antwoord.migraties =
    opstart.migraties === "fout" ? `fout: ${opstart.melding}` : opstart.migraties;

  const gezond = antwoord.configuratie === "ok" && antwoord.database === "ok" && opstart.migraties !== "fout";
  return NextResponse.json(antwoord, {
    status: gezond ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
