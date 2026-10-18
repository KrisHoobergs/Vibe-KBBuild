import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthPagina, isOpenPagina } from "@/lib/auth/paths";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users being
  // randomly logged out.
  //
  // getClaims ververst een verlopen sessie (nieuwe cookies via setAll) en
  // controleert de JWT; met een asymmetrische sleutel zonder netwerkverzoek.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims.sub ? data.claims : null;

  const pathname = request.nextUrl.pathname;

  // Auth pages - redirect to dashboard if already logged in
  if (user && isAuthPagina(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/artikelen";
    return NextResponse.redirect(url);
  }

  // Standaard dicht: alles behalve de inlog- en open pagina's vraagt een login.
  if (!user && !isAuthPagina(pathname) && !isOpenPagina(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/inloggen";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
