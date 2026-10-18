import "server-only";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { eigenBestandUrl, isGeldigBestand, MAX_DEEL, mimeVoorPad, parseEigenBestandUrl } from "./paden";
import { maakTicket } from "./ticket";
import type { Bucket, StorageDriver } from "./types";

// Bestanden in een map op de server (STORAGE_DIR), bv. een schijf of
// netwerkshare. Alleen voor zelf gehoste installaties: op Vercel is de schijf
// tijdelijk.

function rootMap(): string {
  const dir = getConfig().storage.dir;
  if (!dir) throw new Error("STORAGE_DIR ontbreekt");
  // turbopackIgnore: anders neemt de build het hele project mee in elke functie.
  return path.resolve(/* turbopackIgnore: true */ dir);
}

/** Absoluut pad binnen STORAGE_DIR, of null als het daarbuiten zou vallen. */
function bestandsPad(bucket: Bucket, pad: string): string | null {
  if (!isGeldigBestand(bucket, pad)) return null;
  const root = rootMap();
  const volledig = path.resolve(/* turbopackIgnore: true */ root, bucket, ...pad.split("/"));
  return volledig.startsWith(root + path.sep) ? volledig : null;
}

export const filesystemStorage: StorageDriver = {
  kind: "filesystem",

  async prepareUpload(bucket, pad, opties) {
    const ticket = maakTicket({ bucket, pad, ...opties });
    return {
      methode: "post",
      uploadUrl: `/api/bestanden/upload?ticket=${encodeURIComponent(ticket)}`,
      url: eigenBestandUrl(bucket, pad),
    };
  },

  async put(bucket, pad, data) {
    const doel = bestandsPad(bucket, pad);
    if (!doel) throw new Error("Ongeldig pad");
    await mkdir(path.dirname(doel), { recursive: true });
    // Exclusief aanmaken ("wx"): een bestaand bestand wordt nooit overschreven
    // (EEXIST), ook niet met een opnieuw gebruikt upload-ticket. Mislukt het
    // schrijven halverwege, dan gaat het halve bestand weg.
    try {
      await writeFile(doel, data, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") await rm(doel, { force: true });
      throw error;
    }
  },

  resolveOwnUrl(url) {
    return parseEigenBestandUrl(url, getConfig().siteUrl);
  },

  async get(bucket, pad, bereik) {
    const bron = bestandsPad(bucket, pad);
    if (!bron) return null;

    let grootte: number;
    try {
      const info = await stat(bron);
      if (!info.isFile()) return null;
      grootte = info.size;
    } catch {
      return null;
    }

    const contentType = mimeVoorPad(pad);
    const start = bereik?.start ?? 0;
    // Bij een bereikaanvraag hooguit MAX_DEEL per antwoord (zie database.ts).
    const einde = bereik
      ? Math.min(bereik.einde ?? grootte - 1, grootte - 1, start + MAX_DEEL - 1)
      : grootte - 1;
    const lengte = Math.max(0, einde - start + 1);

    const handle = await open(bron, "r");
    try {
      const data = Buffer.alloc(lengte);
      if (lengte > 0) await handle.read(data, 0, lengte, start);
      return { data, contentType, grootte, ...(bereik ? { bereik: { start, einde } } : {}) };
    } finally {
      await handle.close();
    }
  },
};
