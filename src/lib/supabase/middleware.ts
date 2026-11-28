import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() verifies the session token locally (ES256 signing key) and refreshes it when it's
  // about to expire, without a round trip to Supabase Auth on every page view.
  const { data: claims } = await supabase.auth.getClaims();
  const user = claims?.claims?.sub ? claims.claims : null;

  const path = request.nextUrl.pathname;
  // Signed-out pages: signed-in visitors are sent to the dashboard instead.
  const isAuthPage = path === "/login" || path === "/signup" || path === "/forgot-password";
  const isApiRoute = path.startsWith("/api/");
  const isKeepAlive = path === "/api/keep-alive";
  // Links in Supabase emails land here before there's a session; the route signs the user in.
  const isEmailLink = path === "/auth/callback";

  if (isKeepAlive || isEmailLink) {
    return supabaseResponse;
  }

  if (!user && !isAuthPage && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
