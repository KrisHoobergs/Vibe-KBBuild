import { getIdentity } from "@/lib/auth";
import { dataAfbeeldingen, decodeerDataAfbeelding } from "@/lib/artikel-html";
import { getArticleContentById } from "@/lib/db/repositories/articles";

// Serveert de base64-afbeeldingen die in de inhoud van een artikel zitten (oude
// geplakte schermafbeeldingen) als gewone afbeelding, alleen voor ingelogde
// gebruikers. De leesweergave verwijst ernaar in plaats van de base64 in de
// pagina te zetten. De URL bevat de wijzigingsdatum van het artikel (?v=),
// dus de browser mag lang cachen.

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  if (!(await getIdentity())) return new Response("Niet ingelogd", { status: 401 });

  const { id, n } = await params;
  if (!UUID.test(id) || !/^\d{1,4}$/.test(n)) return new Response("Niet gevonden", { status: 404 });

  const artikel = await getArticleContentById(id);
  const src = artikel ? dataAfbeeldingen(artikel.content)[Number(n)] : undefined;
  const afbeelding = src ? decodeerDataAfbeelding(src) : null;
  if (!artikel || !afbeelding) return new Response("Niet gevonden", { status: 404 });

  // Alleen het adres van de huidige versie mag lang in de cache. Een oudere ?v=
  // (open tabblad, terugknop) krijgt de huidige afbeelding zonder cache, zodat
  // er geen verkeerde afbeelding onder dat adres blijft hangen als intussen
  // een afbeelding verwijderd of verplaatst is.
  const actueel = new URL(request.url).searchParams.get("v") === artikel.updated_at;

  return new Response(new Uint8Array(afbeelding.bytes), {
    headers: {
      "Content-Type": afbeelding.type,
      "Content-Length": String(afbeelding.bytes.length),
      "Cache-Control": actueel ? "private, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
