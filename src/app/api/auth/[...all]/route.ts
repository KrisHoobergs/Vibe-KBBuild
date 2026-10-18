import { toNextJsHandler } from "better-auth/next-js";
import { getBetterAuth } from "@/lib/auth/better-auth";
import { getConfig } from "@/lib/config";

// HTTP-routes van Better Auth (alleen bij de eigen login). Bewust bijna alles
// dicht: inloggen en registreren lopen via server actions, zodat de regels voor
// uitnodigingen en de begrenzing van inlogpogingen niet te omzeilen zijn.
// Open: de sessie opvragen/verlengen en uitloggen.

export const runtime = "nodejs";

const TOEGESTAAN = new Set(["/api/auth/get-session", "/api/auth/sign-out"]);

function bewaakt(methode: "GET" | "POST") {
  return async (request: Request) => {
    const pad = new URL(request.url).pathname.replace(/\/+$/, "");
    if (getConfig().auth.driver !== "local" || !TOEGESTAAN.has(pad)) {
      return new Response("Niet gevonden", { status: 404 });
    }
    return toNextJsHandler(getBetterAuth())[methode](request);
  };
}

export const GET = bewaakt("GET");
export const POST = bewaakt("POST");
