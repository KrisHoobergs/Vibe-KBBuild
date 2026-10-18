import { sql } from "kysely";
import type { Migratie } from "../../migrate";

// Bestanden in de database (STORAGE_DRIVER=database). Bij andere opslag blijft
// de tabel gewoon leeg.
export const files: Migratie = {
  naam: "0004_files",
  transactioneel: true,
  async up(db) {
    await sql`
      CREATE TABLE IF NOT EXISTS files (
        bucket TEXT NOT NULL,
        path TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        data BYTEA NOT NULL,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (bucket, path)
      )
    `.execute(db);
  },
};
