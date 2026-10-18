import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/db/dialect";
import { getStorage } from "@/lib/storage";
import { controleerTicket } from "@/lib/storage/ticket";

// Upload naar de eigen opslag (database of map). Het pad, het type en de
// maximale grootte liggen vast in het ondertekende ticket van prepareUpload;
// alleen de gebruiker die het ticket vroeg, kan ermee uploaden.

export const runtime = "nodejs";

function fout(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  const ticket = controleerTicket(request.nextUrl.searchParams.get("ticket"));
  if (!ticket) return fout(400, "Ongeldige of verlopen upload. Probeer opnieuw.");

  const identiteit = await getIdentity();
  if (!identiteit || identiteit.userId !== ticket.userId) return fout(401, "Niet ingelogd");

  const storage = getStorage();
  if (!storage.put) return fout(400, "Deze opslag ondersteunt geen uploads via de app");

  const type = request.headers.get("content-type")?.split(";")[0].trim();
  if (type !== ticket.contentType) return fout(400, "Bestandstype komt niet overeen");

  const gemeld = Number(request.headers.get("content-length") ?? "0");
  if (gemeld > ticket.maxGrootte) return fout(413, "Bestand is te groot");
  if (!request.body) return fout(400, "Geen bestand ontvangen");

  // Inlezen met een harde grens, ook als content-length ontbreekt of liegt.
  const delen: Uint8Array[] = [];
  let totaal = 0;
  const lezer = request.body.getReader();
  for (;;) {
    const { done, value } = await lezer.read();
    if (done) break;
    totaal += value.byteLength;
    if (totaal > ticket.maxGrootte) {
      await lezer.cancel();
      return fout(413, "Bestand is te groot");
    }
    delen.push(value);
  }
  if (totaal === 0) return fout(400, "Leeg bestand");

  try {
    await storage.put(ticket.bucket, ticket.pad, Buffer.concat(delen), ticket.contentType, ticket.userId);
  } catch (error) {
    if (isUniqueViolation(error) || (error as NodeJS.ErrnoException)?.code === "EEXIST") {
      return fout(409, "Dit bestand bestaat al");
    }
    console.error("Upload opslaan mislukt:", error);
    return fout(500, "Uploaden is mislukt");
  }

  return NextResponse.json({ ok: true });
}
