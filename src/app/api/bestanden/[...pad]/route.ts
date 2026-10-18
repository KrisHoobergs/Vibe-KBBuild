import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getIdentity } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import { isGeldigBestand } from "@/lib/storage/paden";

// Serveert bestanden uit de eigen opslag (database of map), alleen voor
// ingelogde gebruikers. Ondersteunt bereikaanvragen (206): zonder speelt
// Safari geen video's af. Paden zijn uniek en wijzigen nooit, dus lang cachen.

export const runtime = "nodejs";

function parseBereik(header: string | null): { start: number; einde?: number } | "ongeldig" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "ongeldig";
  if (m[1] === "") return { start: -Number(m[2]) }; // laatste N bytes, hieronder omgerekend
  const start = Number(m[1]);
  const einde = m[2] === "" ? undefined : Number(m[2]);
  if (einde !== undefined && einde < start) return "ongeldig";
  return { start, einde };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ pad: string[] }> }) {
  if (!(await getIdentity())) return new Response("Niet ingelogd", { status: 401 });

  const [bucket, ...rest] = (await params).pad;
  const pad = rest.join("/");
  if (!isGeldigBestand(bucket, pad)) return new Response("Niet gevonden", { status: 404 });

  const storage = getStorage();
  if (storage.kind === "supabase") return new Response("Niet gevonden", { status: 404 });

  const etag = `"${createHash("sha1").update(`${bucket}/${pad}`).digest("hex")}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  let bereik = parseBereik(request.headers.get("range"));
  if (bereik === "ongeldig") return new Response(null, { status: 416 });

  if (bereik && bereik.start < 0) {
    // "bytes=-N": eerst de grootte kennen.
    const kop = await storage.get(bucket, pad, { start: 0, einde: 0 });
    if (!kop) return new Response("Niet gevonden", { status: 404 });
    bereik = { start: Math.max(0, kop.grootte + bereik.start) };
  }

  const bestand = await storage.get(bucket, pad, bereik ?? undefined);
  if (!bestand) return new Response("Niet gevonden", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": bestand.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  if (bestand.bereik) {
    if (bestand.bereik.start >= bestand.grootte) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bestand.grootte}` } });
    }
    headers["Content-Range"] = `bytes ${bestand.bereik.start}-${bestand.bereik.einde}/${bestand.grootte}`;
    headers["Content-Length"] = String(bestand.data.length);
    return new Response(new Uint8Array(bestand.data), { status: 206, headers });
  }

  headers["Content-Length"] = String(bestand.data.length);
  return new Response(new Uint8Array(bestand.data), { status: 200, headers });
}
