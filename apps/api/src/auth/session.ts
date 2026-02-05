import { SignJWT, jwtVerify } from "jose";

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-insecure-session-secret-change-me";
const secretKey = new TextEncoder().encode(SESSION_SECRET);

export type SessionClaims = {
  sub: string; // user id
  sol: string; // sol address
};

export async function signSession(claims: SessionClaims) {
  return await new SignJWT({ sol: claims.sol })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const v = await jwtVerify(token, secretKey);
    const sub = String(v.payload.sub ?? "");
    const sol = String((v.payload as any).sol ?? "");
    if (!sub || !sol) return null;
    return { sub, sol };
  } catch {
    return null;
  }
}
