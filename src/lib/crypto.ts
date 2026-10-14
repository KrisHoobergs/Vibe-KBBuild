import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Versleuteling van geheimen in de database (Gmail-app-wachtwoorden).
// AES-256-GCM met een sleutel die alleen in de omgevingsvariabelen van de
// server staat: wie alleen de database heeft, kan niets ontcijferen.

const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.MAIL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("MAIL_ENCRYPTION_KEY ontbreekt in de omgevingsvariabelen");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("MAIL_ENCRYPTION_KEY moet 32 bytes zijn (base64)");
  }
  return key;
}

/** Versleutelt tekst naar `v1:<iv>:<tag>:<ciphertext>` (base64-delen). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((part) =>
    typeof part === "string" ? part : part.toString("base64")
  ).join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Onbekend formaat voor versleutelde gegevens");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
