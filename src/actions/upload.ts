"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser, NIET_INGELOGD } from "@/lib/auth";
import { updateProfileFields } from "@/lib/db/repositories/profiles";
import { getStorage, type Bucket, type UploadTicket } from "@/lib/storage";
import { eigenBestandUrl } from "@/lib/storage/paden";
import type { ActionResult } from "@/types";
import { MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } from "@/lib/constants";

// Uploaden gebeurt in twee stappen: de server controleert het verzoek en geeft
// een eenmalige upload-ticket, daarna stuurt de browser het bestand zelf naar
// de opslag (zie src/lib/storage/client-upload.ts). Zo begrenzen server actions
// (1 MB) en Vercel (4,5 MB) de bestandsgrootte niet. Uitzondering: eigen opslag
// (database) op Vercel, die gaat wel via een functie.

const MAX_UPLOAD_OP_VERCEL = 4 * 1024 * 1024;

export type UploadSoort = "afbeelding" | "video" | "avatar";

const EXTENSIES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
};

function controleer(soort: UploadSoort, contentType: string, grootte: number): string | null {
  if (soort === "video") {
    if (!ACCEPTED_VIDEO_TYPES.includes(contentType)) {
      return "Ongeldig bestandstype. Gebruik MP4, WebM of OGG.";
    }
    if (grootte > MAX_VIDEO_SIZE) return "Bestand is te groot. Maximum is 50MB.";
    return null;
  }
  if (!ACCEPTED_IMAGE_TYPES.includes(contentType)) {
    return soort === "avatar"
      ? "Ongeldig bestandstype"
      : "Ongeldig bestandstype. Gebruik JPEG, PNG, GIF of WebP.";
  }
  if (grootte > MAX_IMAGE_SIZE) return "Bestand is te groot. Maximum is 5MB.";
  return null;
}

export async function prepareUpload(input: {
  soort: UploadSoort;
  contentType: string;
  grootte: number;
  articleId?: string;
}): Promise<ActionResult<UploadTicket>> {
  const fout = controleer(input.soort, input.contentType, input.grootte);
  if (fout) return { success: false, error: fout };

  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  const bestand = `${randomUUID()}.${EXTENSIES[input.contentType]}`;
  let bucket: Bucket;
  let pad: string;
  if (input.soort === "avatar") {
    bucket = "avatars";
    pad = `avatars/${user.id}/${bestand}`;
  } else {
    // Alleen een id of "temp" als mapnaam, zodat er geen paden te verzinnen zijn.
    const map = input.articleId && /^[a-zA-Z0-9-]{1,64}$/.test(input.articleId) ? input.articleId : "temp";
    bucket = "articles";
    pad = `articles/${map}/${bestand}`;
  }

  const storage = getStorage();
  let maxGrootte = input.soort === "video" ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  // Uploads naar de eigen opslag gaan via een Vercel-functie, en die aanvaardt
  // hooguit 4,5 MB per verzoek.
  if (process.env.VERCEL && storage.kind !== "supabase") {
    maxGrootte = Math.min(maxGrootte, MAX_UPLOAD_OP_VERCEL);
    if (input.grootte > maxGrootte) {
      return { success: false, error: "Bestand is te groot. Op deze installatie is het maximum 4MB." };
    }
  }

  try {
    const ticket = await storage.prepareUpload(bucket, pad, {
      contentType: input.contentType,
      maxGrootte,
      userId: user.id,
    });
    return { success: true, data: ticket };
  } catch (error) {
    console.error("Upload voorbereiden mislukt:", error);
    return { success: false, error: "Uploaden is mislukt" };
  }
}

/** Na een geslaagde avatar-upload: de nieuwe URL op het profiel zetten. */
export async function finalizeAvatar(url: string): Promise<ActionResult<{ url: string }>> {
  const user = await getCurrentUser();
  if (!user) return NIET_INGELOGD;

  // Alleen een bestand uit de eigen map van deze gebruiker.
  const storage = getStorage();
  const eigen = storage.resolveOwnUrl(url);
  if (!eigen || eigen.bucket !== "avatars" || !eigen.pad.startsWith(`avatars/${user.id}/`)) {
    return { success: false, error: "Ongeldige avatar" };
  }
  // Nooit de tekst van de browser opslaan, maar de nette URL van dat bestand.
  const avatarUrl = storage.kind === "supabase" ? url : eigenBestandUrl(eigen.bucket, eigen.pad);

  try {
    await updateProfileFields(user.id, { avatar_url: avatarUrl });
  } catch (error) {
    console.error("Avatar opslaan mislukt:", error);
    return { success: false, error: "Avatar opslaan mislukt" };
  }

  revalidatePath("/", "layout");
  return { success: true, data: { url: avatarUrl } };
}
