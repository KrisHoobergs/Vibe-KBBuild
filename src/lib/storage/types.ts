export type Bucket = "articles" | "avatars";

/**
 * Wat de browser nodig heeft om een bestand zelf op te sturen. Het bestand gaat
 * niet via een server action, want die (en Vercel) begrenzen de grootte.
 */
export type UploadTicket =
  | {
      /** Rechtstreeks naar Supabase Storage met een ondertekende upload-URL. */
      methode: "supabase";
      supabaseUrl: string;
      anonKey: string;
      bucket: Bucket;
      pad: string;
      token: string;
      /** De URL waaronder het bestand na de upload bereikbaar is. */
      url: string;
    }
  | {
      /** POST naar de eigen upload-route (opslag in database of map). */
      methode: "post";
      uploadUrl: string;
      url: string;
    };

/** Een (deel van een) bestand; `grootte` is altijd de volledige bestandsgrootte. */
export type Bestand = {
  data: Buffer;
  contentType: string;
  grootte: number;
  /** Alleen bij een bereikaanvraag: welk deel `data` bevat (inclusief einde). */
  bereik?: { start: number; einde: number };
};

export interface StorageDriver {
  kind: "supabase" | "database" | "filesystem";
  /** Bereidt een upload voor; de browser stuurt het bestand daarna zelf. */
  prepareUpload(
    bucket: Bucket,
    pad: string,
    opties: { contentType: string; maxGrootte: number; userId: string }
  ): Promise<UploadTicket>;
  /** Slaat een bestand op (database en map; via de upload-route). */
  put?(bucket: Bucket, pad: string, data: Buffer, contentType: string, userId: string): Promise<void>;
  /** Herkent een URL van de eigen opslag (bv. voor de e-mailbouwer), anders null. */
  resolveOwnUrl(url: string): { bucket: Bucket; pad: string } | null;
  /** Leest een bestand of een bereik ervan (start/einde inclusief). */
  get(bucket: Bucket, pad: string, bereik?: { start: number; einde?: number }): Promise<Bestand | null>;
}
