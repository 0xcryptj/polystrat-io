import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Vite will inline these at build time; this error is useful in dev.
  console.warn("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set apps/web/.env.local");
}

export const supabase = createClient(url ?? "", anonKey ?? "");
