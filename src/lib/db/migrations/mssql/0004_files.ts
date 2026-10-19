import { sql } from "kysely";
import type { Migratie } from "../../migrate";

// Bestanden in de database (STORAGE_DRIVER=database). Bij andere opslag blijft
// de tabel gewoon leeg. path is begrensd: de geclusterde primaire sleutel mag
// hooguit 900 bytes zijn (bucket 40 + path 800). De paden maakt de server zelf
// (± 90 tekens, zie src/actions/upload.ts).
export const files: Migratie = {
  naam: "0004_files",
  transactioneel: true,
  async up(db) {
    await sql`
      IF OBJECT_ID(N'dbo.files', N'U') IS NULL
      CREATE TABLE dbo.files (
        "bucket" nvarchar(20) NOT NULL,
        "path" nvarchar(400) NOT NULL,
        "content_type" nvarchar(255) NOT NULL,
        "size" int NOT NULL,
        "data" varbinary(max) NOT NULL,
        "created_by" nvarchar(36) NULL,
        "created_at" datetime2(3) NOT NULL CONSTRAINT DF_files_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_files PRIMARY KEY ("bucket", "path")
      )
    `.execute(db);
  },
};
