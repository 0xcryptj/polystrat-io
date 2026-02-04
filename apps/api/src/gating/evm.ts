import { Contract, JsonRpcProvider, formatUnits, getAddress, isAddress, parseUnits } from "ethers";
import type { LinkedWallet } from "../wallets/types.js";
import type { GatingStatus } from "./types.js";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)"
];

export async function checkEvmErc20Gate(params: {
  wallets: LinkedWallet[];
  rpcUrl?: string;
  tokenAddress?: string;
  tokenDecimals?: number;
  minBalanceHuman?: string;
}): Promise<GatingStatus> {
  const checked: { chain: "evm"; address: string; balance: string }[] = [];

  const rpcUrl = params.rpcUrl;
  const tokenAddress = params.tokenAddress;
  const decimals = params.tokenDecimals;
  const minHuman = params.minBalanceHuman;

  if (!rpcUrl || !tokenAddress || decimals == null || !minHuman) {
    return {
      allowed: false,
      reason: "missing_config",
      details: { tokenType: "evm-erc20", token: tokenAddress, minimum: minHuman, checked }
    };
  }

  if (!isAddress(tokenAddress)) {
    return {
      allowed: false,
      reason: "missing_config",
      details: { tokenType: "evm-erc20", token: tokenAddress, minimum: minHuman, checked }
    };
  }

  const evmWallets = params.wallets.filter((w) => w.chain === "evm");
  if (!evmWallets.length) {
    return {
      allowed: false,
      reason: "no_wallet_linked",
      details: { tokenType: "evm-erc20", token: tokenAddress, minimum: minHuman, checked }
    };
  }

  let minRaw: bigint;
  try {
    minRaw = parseUnits(minHuman, decimals);
  } catch {
    return {
      allowed: false,
      reason: "missing_config",
      details: { tokenType: "evm-erc20", token: tokenAddress, minimum: minHuman, checked }
    };
  }

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const token = new Contract(getAddress(tokenAddress), ERC20_ABI, provider);

    for (const w of evmWallets) {
      if (!isAddress(w.address)) continue;
      const addr = getAddress(w.address);
      const bal: bigint = await token.balanceOf(addr);
      checked.push({ chain: "evm", address: addr, balance: formatUnits(bal, decimals) });
      if (bal >= minRaw) {
        return {
          allowed: true,
          reason: "ok",
          details: { tokenType: "evm-erc20", token: getAddress(tokenAddress), minimum: minHuman, checked }
        };
      }
    }

    return {
      allowed: false,
      reason: "below_minimum",
      details: { tokenType: "evm-erc20", token: getAddress(tokenAddress), minimum: minHuman, checked }
    };
  } catch (e) {
    return {
      allowed: false,
      reason: "rpc_error",
      details: { tokenType: "evm-erc20", token: tokenAddress, minimum: minHuman, checked }
    };
  }
}
