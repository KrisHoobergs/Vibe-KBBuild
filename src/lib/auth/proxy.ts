import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Sessiecontrole voor elk paginaverzoek (proxy.ts). Bewust zonder database-
// of config-imports: de proxy moet licht blijven.

export async function handleProxy(request: NextRequest) {
  const driver = process.env.AUTH_DRIVER || "supabase";
  if (driver === "supabase") return updateSession(request);
  throw new Error(`Login-systeem "${driver}" wordt nog niet ondersteund`);
}
