import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

// Herstellinks bij de eigen login: een beheerder maakt er een en geeft hem zelf
// door. Eenmalig te gebruiken en beperkt geldig.

const GELDIGHEID_MS = 7 * 24 * 60 * 60 * 1000;

/** Maakt een nieuwe herstellink; oudere, nog open links van die gebruiker vervallen. */
export async function insertPasswordReset(userId: string, createdBy: string): Promise<{ token: string; expiresAt: Date }> {
  const nu = new Date();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(nu.getTime() + GELDIGHEID_MS);
  await getDb()
    .transaction()
    .execute(async (trx) => {
      await trx
        .updateTable("password_resets")
        .set({ used_at: nu })
        .where("user_id", "=", userId)
        .where("used_at", "is", null)
        .execute();
      await trx
        .insertInto("password_resets")
        .values({ id: randomUUID(), user_id: userId, token, created_by: createdBy, expires_at: expiresAt, used_at: null, created_at: nu })
        .execute();
    });
  return { token, expiresAt };
}

/** Laat alle nog open herstellinks van een gebruiker vervallen. */
export async function revokeOpenPasswordResets(userId: string): Promise<void> {
  await getDb()
    .updateTable("password_resets")
    .set({ used_at: new Date() })
    .where("user_id", "=", userId)
    .where("used_at", "is", null)
    .execute();
}

/** De gebruiker van een geldige (ongebruikte, niet verlopen) herstellink, of null. */
export async function getValidPasswordReset(token: string): Promise<{ userId: string; email: string } | null> {
  const rij = await getDb()
    .selectFrom("password_resets")
    .innerJoin("profiles", "profiles.id", "password_resets.user_id")
    .select(["password_resets.user_id", "profiles.email"])
    .where("password_resets.token", "=", token)
    .where("password_resets.used_at", "is", null)
    .where("password_resets.expires_at", ">", new Date())
    .executeTakeFirst();
  return rij ? { userId: rij.user_id, email: rij.email } : null;
}

/**
 * Markeert de link als gebruikt. Geeft false als iemand hem intussen al
 * gebruikte (zo werkt een link echt maar één keer).
 */
export async function markPasswordResetUsed(token: string): Promise<boolean> {
  const resultaat = await getDb()
    .updateTable("password_resets")
    .set({ used_at: new Date() })
    .where("token", "=", token)
    .where("used_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
  return Number(resultaat.numUpdatedRows) > 0;
}
