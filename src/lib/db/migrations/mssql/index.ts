import type { Migratie } from "../../migrate";
import { basis } from "./0001_basis";
import { auth } from "./0002_auth";
import { passwordResets } from "./0003_password_resets";
import { files } from "./0004_files";
import { fulltext } from "./0005_fulltext";

// Volgorde is belangrijk: nieuwe migraties altijd achteraan toevoegen. De
// namen van 0001-0004 zijn dezelfde als in de Postgres-map.
export const mssqlMigraties: Migratie[] = [basis, auth, passwordResets, files, fulltext];

// Alleen de public-tabellen (zoals postgres/index.ts) plus het zoeken: voor een
// SQL Server-kopie van de lokale testdata zonder eigen login.
export const mssqlBasisMigraties: Migratie[] = [basis, fulltext];
