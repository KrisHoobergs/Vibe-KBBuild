import { icoonSvg, leesInstallatieWeergave } from "@/lib/installatie";

// Tabblad-icoon van deze installatie (zie src/lib/installatie.ts). Openbaar:
// het bevat alleen de afkorting en de kleur. De URL draagt de versie (?v=),
// dus alleen die mag lang in de cache; een andere versie krijgt het huidige
// icoon zonder cache.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const installatie = leesInstallatieWeergave();
  if (!installatie) return new Response("Niet gevonden", { status: 404 });

  const actueel = new URL(request.url).searchParams.get("v") === installatie.versie;
  return new Response(icoonSvg(installatie), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": actueel ? "public, max-age=31536000, immutable" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
