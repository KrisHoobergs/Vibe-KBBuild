"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser, NIET_INGELOGD } from "@/lib/auth";
import { updateProfileFields } from "@/lib/db/repositories/profiles";
import { getStorage, type Bucket, type UploadTicket } from "@/lib/storage";
import type { ActionResult } from "@/types";
import { MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } from "@/lib/constants";

// Uploaden gebeurt in twee stappen: de server controleert het verzoek en geeft
// een eenmalige upload-ticket, daarna stuurt de browser het bestand zelf naar
// de opslag (zie src/lib/storage/client-upload.ts). Zo begrenzen server actions
// (1 MB) en Vercel (4,5 MB) de bestandsgrootte niet.

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

  try {
    return { success: true, data: await getStorage().prepareUpload(bucket, pad) };
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
  const eigen = getStorage().resolveOwnUrl(url);
  if (!eigen || eigen.bucket !== "avatars" || !eigen.pad.startsWith(`avatars/${user.id}/`)) {
    return { success: false, error: "Ongeldige avatar" };
  }

  try {
    await updateProfileFields(user.id, { avatar_url: url });
  } catch (error) {
    console.error("Avatar opslaan mislukt:", error);
    return { success: false, error: "Avatar opslaan mislukt" };
  }

  revalidatePath("/", "layout");
  return { success: true, data: { url } };
}
