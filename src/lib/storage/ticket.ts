import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config";
import { isGeldigBestand } from "./paden";
import type { Bucket } from "./types";

// Upload-ticket voor opslag in de database of een map: een korte, ondertekende
// toelating om precies één bestand (bucket, pad, type, maximale grootte) te
// uploaden, alleen door de gebruiker die het ticket vroeg.

export type TicketInhoud = {
  bucket: Bucket;
  pad: string;
  contentType: string;
  maxGrootte: number;
  userId: string;
  verlooptOp: number;
};

const GELDIGHEID_MS = 15 * 60 * 1000;

function sleutel(): Buffer {
  const secret = getConfig().secret;
  if (!secret) throw new Error("BETTER_AUTH_SECRET ontbreekt");
  // Aparte afgeleide sleutel, zodat het login-geheim nergens anders rechtstreeks dient.
  return Buffer.from(hkdfSync("sha256", secret, "kbbuild", "upload-ticket", 32));
}

function onderteken(data: string): string {
  return createHmac("sha256", sleutel()).update(data).digest("base64url");
}

export function maakTicket(inhoud: Omit<TicketInhoud, "verlooptOp">): string {
  const volledig: TicketInhoud = { ...inhoud, verlooptOp: Date.now() + GELDIGHEID_MS };
  const data = Buffer.from(JSON.stringify(volledig)).toString("base64url");
  return `${data}.${onderteken(data)}`;
}

/** Geeft de inhoud terug als het ticket echt, onverlopen en geldig is; anders null. */
export function controleerTicket(ticket: string | null): TicketInhoud | null {
  if (!ticket) return null;
  const [data, handtekening, ...rest] = ticket.split(".");
  if (!data || !handtekening || rest.length > 0) return null;

  const verwacht = Buffer.from(onderteken(data));
  const gekregen = Buffer.from(handtekening);
  if (verwacht.length !== gekregen.length || !timingSafeEqual(verwacht, gekregen)) return null;

  let inhoud: TicketInhoud;
  try {
    inhoud = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof inhoud.verlooptOp !== "number" || inhoud.verlooptOp < Date.now()) return null;
  if (!isGeldigBestand(inhoud.bucket, inhoud.pad)) return null;
  return inhoud;
}
