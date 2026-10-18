import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // Do not run code between createServerClient and supabase.auth.getUser().
  // A simple mistake could make it very hard to debug issues with users being
  // randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Auth pages - redirect to dashboard if already logged in
  const authPages = ["/inloggen", "/registreren", "/wachtwoord-vergeten"];
  if (user && authPages.some((page) => pathname.startsWith(page))) {
    const url = request.nextUrl.clone();
    url.pathname = "/artikelen";
    return NextResponse.redirect(url);
  }

  // Invitation pages are accessible without login
  if (pathname.startsWith("/uitnodiging")) {
    return supabaseResponse;
  }

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = [
    "/artikelen",
    "/tags",
    "/zoeken",
    "/profiel",
    "/beheer",
  ];
  if (
    !user &&
    protectedPaths.some((path) => pathname.startsWith(path))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/inloggen";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
