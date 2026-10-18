import type { Migratie } from "../../migrate";
import { basis } from "./0001_basis";
import { auth } from "./0002_auth";
import { passwordResets } from "./0003_password_resets";
import { files } from "./0004_files";

// Volgorde is belangrijk: nieuwe migraties altijd achteraan toevoegen.
export const postgresMigraties: Migratie[] = [basis, auth, passwordResets, files];

// Het deel van het schema dat ook de Supabase-installatie heeft (de public-
// tabellen). De lokale testkopie van productie gebruikt alleen dit deel.
export const postgresBasisMigraties: Migratie[] = [basis];
