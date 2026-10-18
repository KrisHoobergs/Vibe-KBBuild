export type Bucket = "articles" | "avatars";

/**
 * Wat de browser nodig heeft om een bestand zelf op te sturen. Het bestand gaat
 * niet via een server action, want die (en Vercel) begrenzen de grootte.
 */
export type UploadTicket = {
  methode: "supabase";
  supabaseUrl: string;
  anonKey: string;
  bucket: Bucket;
  pad: string;
  token: string;
  /** De URL waaronder het bestand na de upload bereikbaar is. */
  url: string;
};

export interface StorageDriver {
  kind: "supabase" | "database" | "filesystem";
  /** Bereidt een upload voor; de browser stuurt het bestand daarna zelf. */
  prepareUpload(bucket: Bucket, pad: string): Promise<UploadTicket>;
  /** Herkent een URL van de eigen opslag (bv. voor de e-mailbouwer), anders null. */
  resolveOwnUrl(url: string): { bucket: Bucket; pad: string } | null;
  /** Leest een bestand uit de eigen opslag. */
  get(bucket: Bucket, pad: string): Promise<{ data: Buffer; contentType: string } | null>;
}
