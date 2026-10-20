import { sql } from "kysely";
import type { Migratie } from "../../migrate";

// Herstellinks: een beheerder maakt er een voor een gebruiker en geeft hem zelf
// door (er is geen mailserver). Eenmalig te gebruiken, beperkt geldig.
// created_by is NO ACTION (Postgres: SET NULL): een tweede cascadepad vanuit
// profiles weigert SQL Server (Msg 1785).
export const passwordResets: Migratie = {
  naam: "0003_password_resets",
  transactioneel: true,
  async up(db) {
    await sql`
      IF OBJECT_ID(N'dbo.password_resets', N'U') IS NULL
      CREATE TABLE dbo.password_resets (
        "id" nvarchar(36) NOT NULL CONSTRAINT PK_password_resets PRIMARY KEY,
        "user_id" nvarchar(36) NOT NULL
          CONSTRAINT FK_password_resets_user REFERENCES dbo.profiles ("id") ON DELETE CASCADE,
        "token" nvarchar(128) NOT NULL CONSTRAINT UQ_password_resets_token UNIQUE,
        "created_by" nvarchar(36) NULL
          CONSTRAINT FK_password_resets_created_by REFERENCES dbo.profiles ("id"),
        "expires_at" datetime2(3) NOT NULL,
        "used_at" datetime2(3) NULL,
        "created_at" datetime2(3) NOT NULL CONSTRAINT DF_password_resets_created_at DEFAULT SYSUTCDATETIME()
      )
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.password_resets') AND name = N'idx_password_resets_user')
      CREATE INDEX idx_password_resets_user ON dbo.password_resets ("user_id")
    `.execute(db);
  },
};
