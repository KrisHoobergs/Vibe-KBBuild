import "server-only";
import { sql } from "kysely";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db";
import { eigenBestandUrl, isGeldigBestand, MAX_DEEL, parseEigenBestandUrl } from "./paden";
import { maakTicket } from "./ticket";
import type { StorageDriver } from "./types";

// Bestanden als binaire kolom in de tabel "files". Niets extra te beheren
// (back-up van de database = back-up van de bestanden), maar de database
// groeit mee. Bij een bereikaanvraag (video) wordt alleen dat deel gelezen.

export const databaseStorage: StorageDriver = {
  kind: "database",

  async prepareUpload(bucket, pad, opties) {
    const ticket = maakTicket({ bucket, pad, ...opties });
    return {
      methode: "post",
      uploadUrl: `/api/bestanden/upload?ticket=${encodeURIComponent(ticket)}`,
      url: eigenBestandUrl(bucket, pad),
    };
  },

  async put(bucket, pad, data, contentType, userId) {
    if (!isGeldigBestand(bucket, pad)) throw new Error("Ongeldig pad");
    await getDb()
      .insertInto("files")
      .values({
        bucket,
        path: pad,
        content_type: contentType,
        size: data.length,
        data,
        created_by: userId,
        created_at: new Date(),
      })
      .execute();
  },

  resolveOwnUrl(url) {
    return parseEigenBestandUrl(url, getConfig().siteUrl);
  },

  async get(bucket, pad, bereik) {
    if (!isGeldigBestand(bucket, pad)) return null;
    const db = getDb();
    const meta = await db
      .selectFrom("files")
      .select(["content_type", "size"])
      .where("bucket", "=", bucket)
      .where("path", "=", pad)
      .executeTakeFirst();
    if (!meta) return null;

    const grootte = Number(meta.size);
    if (!bereik) {
      const rij = await db
        .selectFrom("files")
        .select("data")
        .where("bucket", "=", bucket)
        .where("path", "=", pad)
        .executeTakeFirstOrThrow();
      return { data: Buffer.from(rij.data), contentType: meta.content_type, grootte };
    }

    // Hooguit MAX_DEEL per antwoord: een videospeler vraagt "bytes=0-" en
    // haalt daarna zelf de volgende stukken.
    const start = bereik.start;
    const einde = Math.min(bereik.einde ?? grootte - 1, grootte - 1, start + MAX_DEEL - 1);
    if (start > einde) return { data: Buffer.alloc(0), contentType: meta.content_type, grootte, bereik: { start, einde } };
    const { rows } = await sql<{ deel: Buffer }>`
      SELECT substring(data FROM ${start + 1} FOR ${einde - start + 1}) AS deel
      FROM files WHERE bucket = ${bucket} AND path = ${pad}
    `.execute(db);
    return {
      data: Buffer.from(rows[0].deel),
      contentType: meta.content_type,
      grootte,
      bereik: { start, einde },
    };
  },
};
