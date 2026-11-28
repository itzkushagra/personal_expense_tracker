import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * The signed-in user, from their session token. getClaims() checks the token's signature
 * locally against the project's public (ES256) signing key, so unlike getUser() it doesn't make a
 * round trip to Supabase Auth on every request (the server runs far from the database region).
 * Every query still goes through row-level security with the same token.
 */
export async function getSessionUser(supabase: SupabaseClient): Promise<{ id: string; email?: string } | null> {
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string" || !sub) return null;
  const email = data?.claims?.email;
  return { id: sub, email: typeof email === "string" ? email : undefined };
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
