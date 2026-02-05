import assert from "node:assert";
import { getSplTokenBalance, getSplTokenDecimals } from "./rpc.js";

// Mock fetch for rpc.ts
const calls: any[] = [];
(globalThis as any).fetch = async (_url: string, init: any) => {
  const body = JSON.parse(init.body);
  calls.push(body);

  if (body.method === "getTokenSupply") {
    return {
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: { value: { decimals: 6 } } })
    } as any;
  }

  if (body.method === "getTokenAccountsByOwner") {
    return {
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: 1,
        result: {
          value: [
            { account: { data: { parsed: { info: { tokenAmount: { amount: "100" } } } } } },
            { account: { data: { parsed: { info: { tokenAmount: { amount: "250" } } } } } }
          ]
        }
      })
    } as any;
  }

  return { ok: false, status: 500, json: async () => ({}) } as any;
};

const decimals = await getSplTokenDecimals({ mint: "MINT" });
assert.equal(decimals, 6);

const bal = await getSplTokenBalance({ owner: "OWNER", mint: "MINT" });
assert.equal(bal, 350n);

assert.equal(calls.length, 2);
console.log("ok solana rpc parsing");
