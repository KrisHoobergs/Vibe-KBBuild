"use server";

import { createClient } from "@/lib/supabase/server";
import { v4 as uuidv4 } from "uuid";
import type { ActionResult } from "@/types";
import { MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } from "@/lib/constants";

export async function uploadArticleImage(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const file = formData.get("file") as File;
  const articleId = formData.get("articleId") as string;

  if (!file) {
    return { success: false, error: "Geen bestand geselecteerd" };
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { success: false, error: "Ongeldig bestandstype. Gebruik JPEG, PNG, GIF of WebP." };
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return { success: false, error: "Bestand is te groot. Maximum is 5MB." };
  }

  const supabase = await createClient();
  const ext = file.name.split(".").pop();
  const path = `articles/${articleId || "temp"}/${uuidv4()}.${ext}`;

  const { error } = await supabase.storage
    .from("articles")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Image upload error:", error);
    return { success: false, error: error.message };
  }

  const { data: urlData } = supabase.storage
    .from("articles")
    .getPublicUrl(path);

  return { success: true, data: { url: urlData.publicUrl } };
}

export async function uploadArticleVideo(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const file = formData.get("file") as File;
  const articleId = formData.get("articleId") as string;

  if (!file) {
    return { success: false, error: "Geen bestand geselecteerd" };
  }

  if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
    return { success: false, error: "Ongeldig bestandstype. Gebruik MP4, WebM of OGG." };
  }

  if (file.size > MAX_VIDEO_SIZE) {
    return { success: false, error: "Bestand is te groot. Maximum is 50MB." };
  }

  const supabase = await createClient();
  const ext = file.name.split(".").pop();
  const path = `articles/${articleId || "temp"}/${uuidv4()}.${ext}`;

  const { error } = await supabase.storage
    .from("articles")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Video upload error:", error);
    return { success: false, error: error.message };
  }

  const { data: urlData } = supabase.storage
    .from("articles")
    .getPublicUrl(path);

  return { success: true, data: { url: urlData.publicUrl } };
}

export async function uploadAvatar(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const file = formData.get("file") as File;

  if (!file) {
    return { success: false, error: "Geen bestand geselecteerd" };
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { success: false, error: "Ongeldig bestandstype" };
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return { success: false, error: "Bestand is te groot. Maximum is 5MB." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Niet ingelogd" };
  }

  const ext = file.name.split(".").pop();
  const path = `avatars/${user.id}/${uuidv4()}.${ext}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file);

  if (error) {
    return { success: false, error: error.message };
  }

  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(path);

  // Update profile with new avatar URL
  await supabase
    .from("profiles")
    .update({ avatar_url: urlData.publicUrl })
    .eq("id", user.id);

  return { success: true, data: { url: urlData.publicUrl } };
}
