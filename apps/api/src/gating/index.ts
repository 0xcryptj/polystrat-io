import type { LinkedWallet } from "../wallets/types.js";
import type { GatingStatus } from "./types.js";
import { checkEvmErc20Gate } from "./evm.js";

export async function getGatingStatus(params: { wallets: LinkedWallet[] }): Promise<GatingStatus> {
  const enabled = String(process.env.GATE_ENABLED ?? "false").toLowerCase() === "true";
  if (!enabled) {
    return { allowed: true, reason: "ok", details: { tokenType: String(process.env.GATE_TOKEN_TYPE ?? "").trim(), checked: [] } };
  }

  const tokenType = String(process.env.GATE_TOKEN_TYPE ?? "").trim();

  if (tokenType === "evm-erc20") {
    const rpcUrl = process.env.GATE_EVM_RPC_URL;
    const tokenAddress = process.env.GATE_EVM_TOKEN_ADDRESS;
    const decimals = process.env.GATE_EVM_TOKEN_DECIMALS ? Number(process.env.GATE_EVM_TOKEN_DECIMALS) : undefined;
    const min = process.env.GATE_MIN_BALANCE;

    return await checkEvmErc20Gate({
      wallets: params.wallets,
      rpcUrl,
      tokenAddress,
      tokenDecimals: decimals,
      minBalanceHuman: min
    });
  }

  if (tokenType === "sol-spl") {
    return {
      allowed: false,
      reason: "unsupported_token_type",
      details: { tokenType, checked: [] }
    };
  }

  return {
    allowed: false,
    reason: "unsupported_token_type",
    details: { tokenType, checked: [] }
  };
}
