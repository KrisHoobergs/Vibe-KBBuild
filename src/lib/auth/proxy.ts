import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { updateSession } from "@/lib/supabase/middleware";
import { isAuthPagina, isOpenPagina } from "./paths";

// Sessiecontrole voor elk paginaverzoek (proxy.ts). Bewust zonder database-
// of config-imports: de proxy moet licht blijven.

export async function handleProxy(request: NextRequest) {
  const driver = process.env.AUTH_DRIVER || "supabase";
  if (driver === "supabase") return updateSession(request);
  if (driver === "local") return eigenLogin(request);
  throw new Error(`Onbekend login-systeem "${driver}"`);
}

/**
 * Eigen login: hier alleen kijken óf er een sessiecookie is (snel, zonder
 * database). Of de sessie echt geldig is, controleert de pagina zelf
 * (requireUser). Daarom ook geen doorsturen weg van de inlogpagina: met een
 * verlopen cookie zou dat een lus geven.
 */
function eigenLogin(request: NextRequest) {
  const pad = request.nextUrl.pathname;
  if (!getSessionCookie(request) && !isAuthPagina(pad) && !isOpenPagina(pad)) {
    const url = request.nextUrl.clone();
    url.pathname = "/inloggen";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
