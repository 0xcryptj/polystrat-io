import type http from "node:http";
import { parse as parseCookie } from "cookie";
import { verifySession } from "./session.js";

export async function requireSession(req: http.IncomingMessage): Promise<{ userId: string; solAddress: string }> {
  const cookieHeader = String(req.headers.cookie ?? "");
  const cookies = parseCookie(cookieHeader || "");
  const token = cookies["ps_session"];
  if (!token) throw new Error("unauthorized");

  const s = await verifySession(token);
  if (!s) throw new Error("unauthorized");
  return { userId: s.sub, solAddress: s.sol };
}
