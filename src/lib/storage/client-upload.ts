import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prepareUpload, type UploadSoort } from "@/actions/upload";
import type { ActionResult } from "@/types";

// Browserkant van een upload: ticket vragen aan de server, daarna het bestand
// rechtstreeks naar de opslag sturen.

const supabaseClients = new Map<string, SupabaseClient>();

function supabaseVoor(url: string, anonKey: string): SupabaseClient {
  let client = supabaseClients.get(url);
  if (!client) {
    // Alleen voor de upload met een eenmalig token; geen sessie nodig.
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    supabaseClients.set(url, client);
  }
  return client;
}

/**
 * Uploadt een bestand en geeft de URL terug. Gooit nooit: een netwerkfout of
 * een mislukte server action (bv. na een nieuwe deploy) wordt een gewone
 * foutmelding, zodat de editor zijn upload-teller altijd kan terugzetten.
 */
export async function uploadBestand(
  file: File,
  soort: UploadSoort,
  articleId?: string
): Promise<ActionResult<{ url: string }>> {
  try {
    return await upload(file, soort, articleId);
  } catch (error) {
    console.error("Upload mislukt:", error);
    return { success: false, error: "Uploaden is mislukt" };
  }
}

async function upload(file: File, soort: UploadSoort, articleId?: string): Promise<ActionResult<{ url: string }>> {
  const ticket = await prepareUpload({
    soort,
    contentType: file.type,
    grootte: file.size,
    articleId,
  });
  if (!ticket.success || !ticket.data) {
    return { success: false, error: ticket.error ?? "Uploaden is mislukt" };
  }

  const t = ticket.data;
  if (t.methode === "post") {
    // Eigen opslag (database of map): rechtstreeks naar de upload-route.
    try {
      const antwoord = await fetch(t.uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!antwoord.ok) {
        const fout = (await antwoord.json().catch(() => null)) as { error?: string } | null;
        return { success: false, error: fout?.error ?? "Uploaden is mislukt" };
      }
    } catch (error) {
      console.error("Upload mislukt:", error);
      return { success: false, error: "Uploaden is mislukt" };
    }
    return { success: true, data: { url: t.url } };
  }

  const { error } = await supabaseVoor(t.supabaseUrl, t.anonKey)
    .storage.from(t.bucket)
    .uploadToSignedUrl(t.pad, t.token, file, { contentType: file.type, cacheControl: "3600" });

  if (error) {
    console.error("Upload mislukt:", error);
    return { success: false, error: "Uploaden is mislukt" };
  }
  return { success: true, data: { url: t.url } };
}
