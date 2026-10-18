// Draait één keer bij het opstarten van de server. Met DB_AUTO_MIGRATE=true
// worden de migraties van een installatie zonder Supabase uitgevoerd; op een
// Supabase-installatie weigert de runner altijd.
//
// Een fout hier legt de site niet plat: ze wordt gelogd en getoond op
// /api/gezondheid, zodat een verkeerde instelling snel te vinden is.

/** Na een verbindingsfout: zo lang wachten en dan opnieuw proberen. */
const OPNIEUW_NA_MS = 60_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DB_AUTO_MIGRATE !== "true") return;

  const { zetOpstartstatus, veiligeFoutmelding } = await import("./lib/db/opstartstatus");

  // Nooit vanuit een Vercel-preview: die zou de migraties van een onafgewerkte
  // branch uitvoeren op de database van de echte installatie.
  if (process.env.VERCEL_ENV === "preview") {
    zetOpstartstatus({ migraties: "niet-automatisch", reden: "Overgeslagen op een preview-deployment" });
    return;
  }

  const { voerMigratiesUit, isVerbindingsfout } = await import("./lib/db/auto-migrate");
  const probeer = async (): Promise<void> => {
    try {
      const uitgevoerd = await voerMigratiesUit((bericht) => console.log(`[migraties] ${bericht}`));
      if (uitgevoerd.length) console.log(`[migraties] uitgevoerd: ${uitgevoerd.join(", ")}`);
      zetOpstartstatus({ migraties: "ok", uitgevoerd });
    } catch (error) {
      console.error("[migraties] mislukt:", error);
      zetOpstartstatus({ migraties: "fout", melding: veiligeFoutmelding(error) });
      // Database (nog) niet bereikbaar, bv. na een herstart van de server:
      // op de achtergrond blijven proberen, zodat /status vanzelf groen wordt.
      // Veilig: migreer() neemt een slot en slaat uitgevoerde migraties over.
      if (isVerbindingsfout(error)) {
        console.log(`[migraties] opnieuw proberen over ${OPNIEUW_NA_MS / 1000} s`);
        setTimeout(() => void probeer(), OPNIEUW_NA_MS).unref();
      }
    }
  };
  await probeer();
}
