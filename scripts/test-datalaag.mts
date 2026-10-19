/**
 * Test alle schrijfacties van de datalaag tegen een LOKALE database en
 * controleert de toestand erna. Alles wat de test aanmaakt, ruimt hij zelf op.
 *
 *   npm run db:test
 *
 * Weigert elke niet-lokale database (src/lib/db/guard.ts). De stappen zelf
 * staan in scripts/lib/datalaag-stappen.mts (gedeeld met db:test:mssql).
 */
const LOKAAL = process.env.LOKALE_DATABASE_URL ?? "postgres://postgres:lokaal@localhost:54329/kbbuild";
process.env.DATABASE_URL = LOKAAL;
process.env.DB_DIALECT ??= "postgres";
process.env.AUTH_DRIVER = "supabase";
process.env.STORAGE_DRIVER = "supabase";

const { assertLokaleDatabase } = await import("../src/lib/db/guard");
assertLokaleDatabase(LOKAAL);

const { maakDatalaagTest } = await import("./lib/datalaag-stappen.mjs");
const test = maakDatalaagTest({ heeftAuthUsers: false, wachtOpZoekindex: async () => {} });

try {
  await test.gedeeldeStappen();
  console.log(`\nAlle ${test.geslaagd} stappen geslaagd.`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await test.opruimen();
  await test.db.destroy();
}
