import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Bucket, StorageDriver } from "./types";

// Supabase Storage: publieke buckets "articles" en "avatars". De publieke URL's
// staan in de artikel-JSON en in profiles.avatar_url, dus het URL-formaat moet
// gelijk blijven. Bestaande bestanden worden nooit verplaatst of verwijderd.

const BUCKETS: Bucket[] = ["articles", "avatars"];
const PUBLIEK_PREFIX = "/storage/v1/object/public/";

// Alleen paden zoals de app ze zelf maakt: mappen van [A-Za-z0-9_-] en een
// bestandsnaam "naam.ext". Zo kan een pad met bv. "..", een (gecodeerde)
// backslash, "?" of "#" nooit naar een ander adres op de Supabase-host leiden.
const VEILIG_PAD = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

/** Hoe lang een bestand ophalen mag duren (bv. afbeeldingen voor een mail). */
const DOWNLOAD_TIMEOUT_MS = 10_000;

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL ontbreekt");
  return url.replace(/\/$/, "");
}

export const supabaseStorage: StorageDriver = {
  kind: "supabase",

  async prepareUpload(bucket, pad) {
    // Met de sessie van de gebruiker: de storage-policies laten alleen
    // ingelogde gebruikers uploaden.
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(pad);
    if (error || !data) throw new Error(error?.message ?? "Upload voorbereiden mislukt");

    const { data: publiek } = supabase.storage.from(bucket).getPublicUrl(pad);
    return {
      methode: "supabase",
      supabaseUrl: supabaseUrl(),
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      bucket,
      pad: data.path,
      token: data.token,
      url: publiek.publicUrl,
    };
  },

  resolveOwnUrl(url) {
    try {
      const u = new URL(url);
      const eigen = new URL(supabaseUrl());
      if (u.protocol !== "https:" && u.protocol !== eigen.protocol) return null;
      if (u.host !== eigen.host || !u.pathname.startsWith(PUBLIEK_PREFIX)) return null;
      if (u.search || u.hash) return null;

      const rest = decodeURIComponent(u.pathname.slice(PUBLIEK_PREFIX.length));
      const [bucket, ...delen] = rest.split("/");
      const pad = delen.join("/");
      if (!BUCKETS.includes(bucket as Bucket) || !VEILIG_PAD.test(pad)) return null;
      return { bucket: bucket as Bucket, pad };
    } catch {
      return null;
    }
  },

  async get(bucket, pad) {
    if (!BUCKETS.includes(bucket) || !VEILIG_PAD.test(pad)) return null;
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(pad, {}, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (error || !data) return null;
      return { data: Buffer.from(await data.arrayBuffer()), contentType: data.type };
    } catch {
      // Bv. een time-out: het bestand wordt dan overgeslagen.
      return null;
    }
  },
};
