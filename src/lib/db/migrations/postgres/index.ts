import type { Migratie } from "../../migrate";
import { basis } from "./0001_basis";

// Volgorde is belangrijk: nieuwe migraties altijd achteraan toevoegen.
export const postgresMigraties: Migratie[] = [basis];

// Het deel van het schema dat ook de Supabase-installatie heeft (de public-
// tabellen). De lokale testkopie van productie gebruikt alleen dit deel.
export const postgresBasisMigraties: Migratie[] = [basis];
