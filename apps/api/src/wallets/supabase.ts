import { createClient } from "@supabase/supabase-js";

// Create a Supabase client that uses the *user's* JWT for RLS.
export function makeUserSupabaseClient(accessToken: string) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url) throw new Error("missing_SUPABASE_URL");
  if (!anon) throw new Error("missing_SUPABASE_ANON_KEY");

  return createClient(url, anon, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
