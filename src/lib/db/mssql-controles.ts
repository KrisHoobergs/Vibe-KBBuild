import { sql, type Kysely } from "kysely";
import { heeftOudeStemmer } from "./search/mssql-query";

// Controles van een SQL Server-installatie: versie, serverinstellingen en
// full-text. Gebruikt door de gezondheidscheck (/status, /api/gezondheid) en
// door het script db:mssql:controle. Geen "server-only": scripts gebruiken
// dit bestand ook.

export type MssqlControles = {
  /** SERVERPROPERTY('ProductMajorVersion'): 13 = 2016, 14 = 2017, 15 = 2019, 16 = 2022, 17 = 2025. */
  hoofdversie: number | null;
  /** SERVERPROPERTY('EngineEdition'): 2 Standard, 3 Enterprise/Developer, 4 Express, 5 Azure SQL Database, 8 Managed Instance. */
  editie: number | null;
  /** 1 als NOCOUNT aanstaat via de serverinstelling "user options" (bit 512). */
  nocount: number;
  /** Collatie van de database. */
  collatie: string | null;
  /** 1 als READ_COMMITTED_SNAPSHOT aanstaat. */
  rcsi: number | null;
  /** FULLTEXTSERVICEPROPERTY('IsFullTextInstalled'). */
  fts: number | null;
  /** 1 als dbo.articles een actieve full-text-index heeft; null zonder tabel. */
  ftindex: number | null;
  /** Wijzigingen die de full-text-index nog moet verwerken; null zonder index. */
  ftwachtend: number | null;
};

/** Leest de controles in één query (geen tabellen nodig, ook vóór de migraties). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function leesMssqlControles(db: Kysely<any>): Promise<MssqlControles> {
  const { rows } = await sql<MssqlControles>`
    SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS int) AS hoofdversie,
           CAST(SERVERPROPERTY('EngineEdition') AS int) AS editie,
           CAST(SIGN(@@OPTIONS & 512) AS int) AS nocount, -- 0/1 (de bit zelf is 512)
           CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS nvarchar(128)) AS collatie,
           (SELECT CAST(is_read_committed_snapshot_on AS int) FROM sys.databases WHERE database_id = DB_ID()) AS rcsi,
           CAST(FULLTEXTSERVICEPROPERTY('IsFullTextInstalled') AS int) AS fts,
           CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableHasActiveFulltextIndex') AS int) AS ftindex,
           CAST(OBJECTPROPERTYEX(OBJECT_ID(N'dbo.articles'), 'TableFulltextPendingChanges') AS int) AS ftwachtend
  `.execute(db);
  const r = rows[0];
  if (!r) throw new Error("SQL Server gaf geen antwoord op de controlequery");
  return r;
}

/**
 * Wat de controles betekenen voor deze installatie. `fataal`: de app werkt
 * niet betrouwbaar (database.ok = false). `waarschuwingen`: werkt, met minder.
 * Bevat bewust geen versie of collatie (die tonen we niet publiek op /status).
 */
export function beoordeelMssqlControles(c: MssqlControles): {
  fataal: string[];
  waarschuwingen: string[];
  zoeken: "full-text" | "eenvoudig";
} {
  const fataal: string[] = [];
  const waarschuwingen: string[] = [];
  if (c.nocount === 1) {
    fataal.push("NOCOUNT staat aan in de serverinstellingen (user options); opslaan werkt dan niet betrouwbaar");
  }
  if (c.hoofdversie !== null && c.hoofdversie < 13) {
    fataal.push("SQL Server 2016 of nieuwer nodig");
  }
  if (c.rcsi === 0) {
    waarschuwingen.push("READ_COMMITTED_SNAPSHOT staat uit");
  }
  // Vóór SQL Server 2025 geeft ook full-text geen vervoegingen (zie
  // heeftOudeStemmer); daar belooft de waarschuwing ze dus niet.
  const oudeStemmer = heeftOudeStemmer(c.hoofdversie);
  const zonderFulltext = oudeStemmer ? "eenvoudig zoeken" : "zoeken zonder vervoegingen";
  if (c.fts !== 1) {
    waarschuwingen.push(`Full-text search is niet geïnstalleerd: ${zonderFulltext}`);
  } else if (c.ftindex !== 1) {
    waarschuwingen.push(`Er is nog geen full-text-index: ${zonderFulltext} (voer de migraties uit)`);
  } else if (oudeStemmer) {
    waarschuwingen.push("Zoeken kent op deze SQL Server-versie geen vervoegingen (pas vanaf SQL Server 2025)");
  }
  return { fataal, waarschuwingen, zoeken: c.ftindex === 1 ? "full-text" : "eenvoudig" };
}
