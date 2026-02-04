import { createRemoteJWKSet, jwtVerify } from "jose";

export type SupabaseUser = {
  userId: string;
  email: string | null;
  raw: any;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifySupabaseJwt(token: string): Promise<SupabaseUser> {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error("missing_SUPABASE_URL");

  if (!jwks) {
    // Supabase JWKS endpoint (standard)
    const jwksUrl = new URL("/auth/v1/.well-known/jwks.json", supabaseUrl);
    jwks = createRemoteJWKSet(jwksUrl);
  }

  const { payload } = await jwtVerify(token, jwks, {
    // Supabase uses issuer == project URL (commonly). If docs differ, we can tighten.
    issuer: supabaseUrl
  });

  const userId = String(payload.sub ?? "");
  const email = payload.email ? String(payload.email) : null;

  if (!userId) throw new Error("invalid_jwt_missing_sub");

  return { userId, email, raw: payload };
}
