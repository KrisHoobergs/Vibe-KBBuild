"use server";

import nodemailer from "nodemailer";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  deleteMailSettingsRow,
  getMailSettingsRow,
  upsertMailSettings,
} from "@/lib/db/repositories/mail-settings";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { buildArticleEmail } from "@/lib/email/article-email";
import { getArticleBySlug } from "@/actions/articles";
import { APP_NAME } from "@/lib/constants";
import type { ActionResult, MailSettingsStatus } from "@/types";

// Artikels versturen via het eigen Gmail-account van de gebruiker (SMTP met
// een app-wachtwoord). De tabel mail_settings is alleen via de server
// bereikbaar (in Supabase: RLS zonder policies); elke actie raakt uitsluitend
// de rij van de ingelogde gebruiker aan.

const settingsSchema = z.object({
  gmail_address: z.string().trim().toLowerCase().pipe(z.email("Ongeldig e-mailadres")),
  app_password: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^[a-zA-Z]{16}$/, "Een app-wachtwoord bestaat uit 16 letters")),
});

const sendSchema = z.object({
  slug: z.string().min(1),
  to: z
    .array(z.string().trim().pipe(z.email("Ongeldig e-mailadres")))
    .min(1, "Geef minstens één ontvanger op")
    .max(10, "Maximaal 10 ontvangers per keer"),
  message: z.string().trim().max(2000, "Bericht is te lang (max. 2000 tekens)").optional(),
});

export async function getMailSettingsStatus(): Promise<MailSettingsStatus> {
  const userId = await getUserId();
  if (!userId) return { configured: false, gmail_address: null };

  const data = await getMailSettingsRow(userId);
  return { configured: !!data, gmail_address: data?.gmail_address ?? null };
}

export async function saveMailSettings(input: {
  gmail_address: string;
  app_password: string;
}): Promise<ActionResult<MailSettingsStatus>> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const userId = await getUserId();
  if (!userId) return { success: false, error: "Niet ingelogd" };

  const { gmail_address, app_password } = parsed.data;

  // Eerst bij Gmail testen, zodat verkeerde gegevens nooit opgeslagen worden.
  try {
    await createTransport(gmail_address, app_password).verify();
  } catch (error) {
    return { success: false, error: gmailError(error) };
  }

  if (!hasEncryptionKey()) {
    return { success: false, error: MISSING_KEY_ERROR };
  }

  try {
    await upsertMailSettings(userId, gmail_address, encryptSecret(app_password));
  } catch (error) {
    console.error("Mailinstellingen opslaan mislukt:", error);
    return { success: false, error: "Opslaan mislukt" };
  }

  revalidatePath("/profiel");
  return { success: true, data: { configured: true, gmail_address } };
}

export async function deleteMailSettings(): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Niet ingelogd" };

  try {
    await deleteMailSettingsRow(userId);
  } catch (error) {
    console.error("Mailinstellingen verwijderen mislukt:", error);
    return { success: false, error: "Verwijderen mislukt" };
  }

  revalidatePath("/profiel");
  return { success: true };
}

export async function sendTestMail(): Promise<ActionResult> {
  const userId = await getUserId();
  if (!userId) return { success: false, error: "Niet ingelogd" };

  const credentials = await getCredentials(userId);
  if (!credentials.success || !credentials.data) {
    return { success: false, error: credentials.error };
  }
  const { gmail_address, app_password } = credentials.data;

  try {
    await createTransport(gmail_address, app_password).sendMail({
      from: { name: APP_NAME, address: gmail_address },
      to: gmail_address,
      subject: `Testmail van ${APP_NAME}`,
      text: `Je Gmail-instelling werkt: artikels die je vanuit ${APP_NAME} verstuurt, vertrekken vanaf dit adres en staan in je Verzonden items.`,
    });
  } catch (error) {
    return { success: false, error: gmailError(error) };
  }

  return { success: true };
}

export async function sendArticleByMail(input: {
  slug: string;
  to: string[];
  message?: string;
}): Promise<ActionResult<{ count: number }>> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Niet ingelogd" };

  const credentials = await getCredentials(user.id);
  if (!credentials.success || !credentials.data) {
    return { success: false, error: credentials.error };
  }
  const { gmail_address, app_password } = credentials.data;

  const article = await getArticleBySlug(parsed.data.slug);
  if (!article) return { success: false, error: "Artikel niet gevonden" };

  const senderName = user.display_name || gmail_address;

  let email: Awaited<ReturnType<typeof buildArticleEmail>>;
  try {
    email = await buildArticleEmail({
      article,
      senderName,
      message: parsed.data.message || undefined,
      articleUrl: `${await siteUrl()}/artikelen/${article.slug}`,
    });
  } catch (error) {
    // Volledige fout in de serverlog (Vercel); de gebruiker krijgt de kern.
    console.error("Mail opbouwen mislukt:", error);
    return {
      success: false,
      error: `Kon de mail niet opbouwen: ${error instanceof Error ? error.message : "onbekende fout"}`,
    };
  }

  try {
    await createTransport(gmail_address, app_password).sendMail({
      from: { name: senderName, address: gmail_address },
      to: parsed.data.to,
      subject: `Artikel: ${article.title}`,
      html: email.html,
      text: email.text,
      attachments: email.attachments,
    });
  } catch (error) {
    return { success: false, error: gmailError(error) };
  }

  return { success: true, data: { count: parsed.data.to.length } };
}

async function getUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/** Leest en ontcijfert de Gmail-gegevens van een gebruiker (alleen server). */
async function getCredentials(
  userId: string
): Promise<ActionResult<{ gmail_address: string; app_password: string }>> {
  const data = await getMailSettingsRow(userId);

  if (!data) {
    return { success: false, error: "Stel eerst je Gmail in bij Profiel → E-mail" };
  }

  if (!hasEncryptionKey()) {
    return { success: false, error: MISSING_KEY_ERROR };
  }

  try {
    return {
      success: true,
      data: {
        gmail_address: data.gmail_address,
        app_password: decryptSecret(data.app_password_encrypted),
      },
    };
  } catch {
    // Bv. een gewijzigde MAIL_ENCRYPTION_KEY: dan opnieuw laten invullen.
    return {
      success: false,
      error: "Je opgeslagen app-wachtwoord kan niet meer gelezen worden. Sla het opnieuw op bij Profiel → E-mail",
    };
  }
}

// Ontbrekende sleutel = serverconfiguratie (bv. niet ingesteld in Vercel),
// niet de schuld van de gebruiker: apart melden in plaats van "opnieuw opslaan".
const MISSING_KEY_ERROR =
  "Versturen is op de server nog niet ingesteld (MAIL_ENCRYPTION_KEY ontbreekt). Neem contact op met de beheerder";

function hasEncryptionKey(): boolean {
  return !!process.env.MAIL_ENCRYPTION_KEY;
}

function createTransport(user: string, pass: string) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

/** Vertaalt SMTP-fouten naar een begrijpelijke melding (zonder geheimen te loggen). */
function gmailError(error: unknown): string {
  const { code, responseCode } = (error ?? {}) as { code?: string; responseCode?: number };
  console.error("Gmail-fout:", code, responseCode);

  if (code === "EAUTH" || responseCode === 534 || responseCode === 535) {
    return "Gmail weigerde het adres of het app-wachtwoord. Controleer ze, of maak een nieuw app-wachtwoord aan";
  }
  if (responseCode === 552) {
    return "De mail is te groot voor Gmail (maximaal 25 MB)";
  }
  if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET" || code === "EDNS") {
    return "Geen verbinding met Gmail. Probeer het later opnieuw";
  }
  return "Versturen via Gmail is mislukt";
}

/** Basis-URL voor de link in de mail. */
async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
