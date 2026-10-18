import "server-only";
import { getConfig } from "@/lib/config";
import { databaseStorage } from "./database";
import { filesystemStorage } from "./filesystem";
import { supabaseStorage } from "./supabase";
import type { StorageDriver } from "./types";

export type { Bestand, Bucket, StorageDriver, UploadTicket } from "./types";

export function getStorage(): StorageDriver {
  switch (getConfig().storage.driver) {
    case "supabase":
      return supabaseStorage;
    case "database":
      return databaseStorage;
    case "filesystem":
      return filesystemStorage;
  }
}
