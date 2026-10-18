import { type NextRequest } from "next/server";
import { handleProxy } from "@/lib/auth/proxy";

export async function proxy(request: NextRequest) {
  return await handleProxy(request);
}

export const config = {
  matcher: [
    /*
     * Alle paden behalve:
     * - api/ (route handlers controleren zelf; de auth-callback zet zelf cookies)
     * - _next/static, _next/image (statische bestanden)
     * - favicon.ico en afbeeldingen uit public/
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
