// Draait één keer bij het opstarten van de server. Met DB_AUTO_MIGRATE=true
// worden de migraties van een installatie zonder Supabase uitgevoerd; op een
// Supabase-installatie weigert de runner altijd.
//
// Een fout hier legt de site niet plat: ze wordt gelogd en getoond op
// /api/gezondheid, zodat een verkeerde instelling snel te vinden is.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DB_AUTO_MIGRATE !== "true") return;

  const { zetOpstartstatus, veiligeFoutmelding } = await import("./lib/db/opstartstatus");
  try {
    const { voerMigratiesUit } = await import("./lib/db/auto-migrate");
    const uitgevoerd = await voerMigratiesUit((bericht) => console.log(`[migraties] ${bericht}`));
    if (uitgevoerd.length) console.log(`[migraties] uitgevoerd: ${uitgevoerd.join(", ")}`);
    zetOpstartstatus({ migraties: "ok", uitgevoerd });
  } catch (error) {
    console.error("[migraties] mislukt:", error);
    zetOpstartstatus({ migraties: "fout", melding: veiligeFoutmelding(error) });
  }
}
