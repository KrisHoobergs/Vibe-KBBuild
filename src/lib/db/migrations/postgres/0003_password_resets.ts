import { sql } from "kysely";
import type { Migratie } from "../../migrate";

// Herstellinks: een beheerder maakt er een voor een gebruiker en geeft hem zelf
// door (er is geen mailserver). Eenmalig te gebruiken, beperkt geldig.
export const passwordResets: Migratie = {
  naam: "0003_password_resets",
  transactioneel: true,
  async up(db) {
    await sql`
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)`.execute(db);
  },
};
