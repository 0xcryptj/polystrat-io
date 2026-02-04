import { verifyMessage } from "ethers";
import bs58 from "bs58";
import nacl from "tweetnacl";
import type { WalletChain } from "./types.js";

export function verifyWalletLink(params: {
  chain: WalletChain;
  address: string;
  message: string;
  signature: string;
}): { ok: true } | { ok: false; error: string } {
  const chain = params.chain;
  const address = params.address.trim();

  if (!address) return { ok: false, error: "missing_address" };
  if (!params.message) return { ok: false, error: "missing_message" };
  if (!params.signature) return { ok: false, error: "missing_signature" };

  try {
    if (chain === "evm") {
      // signature is hex (0x...) for personal_sign
      const recovered = verifyMessage(params.message, params.signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) return { ok: false, error: "evm_signature_mismatch" };
      return { ok: true };
    }

    if (chain === "sol") {
      // address is base58 public key. signature is base64.
      const pub = bs58.decode(address);
      const sig = Buffer.from(params.signature, "base64");
      const msg = new TextEncoder().encode(params.message);
      const ok = nacl.sign.detached.verify(msg, sig, pub);
      if (!ok) return { ok: false, error: "sol_signature_mismatch" };
      return { ok: true };
    }

    return { ok: false, error: "unsupported_chain" };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
