import { sql } from "kysely";
import type { Migratie } from "../../migrate";

// Full-text-index voor het zoeken (Nederlands, LCID 1043) op dbo.articles.
//
// Niet transactioneel: CREATE FULLTEXT CATALOG/INDEX mag niet in een
// transactie. Daarom idempotent: elke stap staat achter een IF-controle.
//
// Zonder Full-Text Search op de server (een aparte installatie-optie, bv.
// "Full-Text and Semantic Extractions for Search" of mssql-server-fts), of
// zonder Nederlandse taal, geeft de migratie "overgeslagen": de runner bewaart
// haar dan niet, zodat ze na het installeren van full-text bij de volgende
// migratie alsnog draait. Het zoeken werkt intussen eenvoudiger (LIKE).
//
// STOPLIST = OFF is bewust: met de systeemstoplijst geeft `woord AND
// ruiswoord` nul resultaten. De app haalt de Nederlandse stopwoorden zelf weg.
// De sleutelindex is PK_articles (uit 0001_basis).
export const fulltext: Migratie = {
  naam: "0005_fulltext",
  transactioneel: false,
  overslaanReden:
    "Full-Text Search is niet geïnstalleerd op de SQL Server (of kent geen Nederlands); zoeken werkt dan eenvoudiger. Na het installeren van full-text de migraties opnieuw uitvoeren.",
  async up(db) {
    const { rows } = await sql<{ fts: number | null; nederlands: number }>`
      SELECT CAST(FULLTEXTSERVICEPROPERTY('IsFullTextInstalled') AS int) AS fts,
             (SELECT COUNT(*) FROM sys.fulltext_languages WHERE lcid = 1043) AS nederlands
    `.execute(db);
    if (rows[0]?.fts !== 1 || !rows[0]?.nederlands) return "overgeslagen";

    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'kb_fulltext')
      CREATE FULLTEXT CATALOG kb_fulltext WITH ACCENT_SENSITIVITY = OFF
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'dbo.articles'))
      CREATE FULLTEXT INDEX ON dbo.articles (
        "search_text" LANGUAGE 1043,
        "title" LANGUAGE 1043,
        "excerpt" LANGUAGE 1043
      )
      KEY INDEX PK_articles ON kb_fulltext
      WITH (CHANGE_TRACKING = AUTO, STOPLIST = OFF)
    `.execute(db);
  },
};
