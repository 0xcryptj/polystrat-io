type RpcResp<T> = { jsonrpc: string; id: number; result?: T; error?: any };

const SOL_RPC_URL = process.env.SOL_RPC_URL || "https://api.mainnet-beta.solana.com";

async function rpc<T>(method: string, params: any[]): Promise<T> {
  const r = await fetch(SOL_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!r.ok) throw new Error(`sol_rpc_http_${r.status}`);
  const j = (await r.json()) as RpcResp<T>;
  if (j.error) throw new Error(`sol_rpc_error_${j.error?.message ?? "unknown"}`);
  return j.result as T;
}

export async function getSplTokenBalance(params: { owner: string; mint: string }): Promise<bigint> {
  // getTokenAccountsByOwner -> parse tokenAmount.amount
  const result = await rpc<any>("getTokenAccountsByOwner", [
    params.owner,
    { mint: params.mint },
    { encoding: "jsonParsed" }
  ]);

  const accounts = result?.value ?? [];
  let total = 0n;
  for (const a of accounts) {
    const amtStr = a?.account?.data?.parsed?.info?.tokenAmount?.amount;
    if (typeof amtStr === "string") {
      try {
        total += BigInt(amtStr);
      } catch {
        // ignore
      }
    }
  }
  return total;
}

export async function getSplTokenDecimals(params: { mint: string }): Promise<number> {
  const res = await rpc<any>("getTokenSupply", [params.mint]);
  const decimals = res?.value?.decimals;
  return Number.isFinite(Number(decimals)) ? Number(decimals) : 0;
}
