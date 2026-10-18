import "server-only";
import { getDb } from "@/lib/db";

// Gmail-instellingen per gebruiker. Het app-wachtwoord staat versleuteld in de
// database (zie src/lib/crypto.ts); deze laag ziet alleen de versleutelde tekst.

export async function getMailSettingsRow(
  userId: string
): Promise<{ gmail_address: string; app_password_encrypted: string } | null> {
  const rij = await getDb()
    .selectFrom("mail_settings")
    .select(["gmail_address", "app_password_encrypted"])
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return rij ?? null;
}

export async function upsertMailSettings(
  userId: string,
  gmailAddress: string,
  appPasswordEncrypted: string
): Promise<void> {
  // Bijwerken of toevoegen, zonder dialect-specifieke ON CONFLICT / MERGE.
  await getDb()
    .transaction()
    .execute(async (trx) => {
      const nu = new Date();
      const resultaat = await trx
        .updateTable("mail_settings")
        .set({ gmail_address: gmailAddress, app_password_encrypted: appPasswordEncrypted, updated_at: nu })
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (Number(resultaat.numUpdatedRows) === 0) {
        await trx
          .insertInto("mail_settings")
          .values({
            user_id: userId,
            gmail_address: gmailAddress,
            app_password_encrypted: appPasswordEncrypted,
            created_at: nu,
            updated_at: nu,
          })
          .execute();
      }
    });
}

export async function deleteMailSettingsRow(userId: string): Promise<void> {
  await getDb().deleteFrom("mail_settings").where("user_id", "=", userId).execute();
}
