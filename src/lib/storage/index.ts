import "server-only";
import { getConfig } from "@/lib/config";
import { supabaseStorage } from "./supabase";
import type { StorageDriver } from "./types";

export type { Bucket, StorageDriver, UploadTicket } from "./types";

export function getStorage(): StorageDriver {
  const { driver } = getConfig().storage;
  if (driver === "supabase") return supabaseStorage;
  throw new Error(`Opslag "${driver}" wordt nog niet ondersteund`);
}
