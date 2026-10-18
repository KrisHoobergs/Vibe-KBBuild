// Draait één keer bij het opstarten van de server. Met DB_AUTO_MIGRATE=true
// worden de migraties van een installatie zonder Supabase uitgevoerd; op een
// Supabase-installatie weigert de runner altijd.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DB_AUTO_MIGRATE !== "true") return;

  const { voerMigratiesUit } = await import("./lib/db/auto-migrate");
  const uitgevoerd = await voerMigratiesUit((bericht) => console.log(`[migraties] ${bericht}`));
  if (uitgevoerd.length) console.log(`[migraties] uitgevoerd: ${uitgevoerd.join(", ")}`);
}
