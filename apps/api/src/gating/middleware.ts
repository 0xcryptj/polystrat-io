import type http from "node:http";
import { makeUserSupabaseClient } from "../wallets/supabase.js";
import { getGatingStatus } from "./index.js";

export async function requireTokenGate(params: {
  req: http.IncomingMessage;
  accessToken: string;
}): Promise<{ allowed: true } | { allowed: false; status: any }> {
  const enabled = String(process.env.GATE_ENABLED ?? "false").toLowerCase() === "true";
  if (!enabled) return { allowed: true };

  const sb = makeUserSupabaseClient(params.accessToken);
  const { data, error } = await sb.from("wallets").select("id,user_id,chain,address,created_at");
  if (error) {
    return { allowed: false, status: { allowed: false, reason: "rpc_error", message: error.message } };
  }

  const status = await getGatingStatus({ wallets: (data ?? []) as any });
  if (!status.allowed) return { allowed: false, status };
  return { allowed: true };
}
