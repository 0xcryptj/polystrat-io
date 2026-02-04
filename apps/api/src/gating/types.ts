export type GateTokenType = "evm-erc20" | "sol-spl";

export type GateStatusReason =
  | "ok"
  | "no_wallet_linked"
  | "below_minimum"
  | "missing_config"
  | "unsupported_token_type"
  | "rpc_error";

export type GatingCheck = {
  chain: "evm" | "sol";
  address: string;
  balance: string; // human units
};

export type GatingStatus = {
  allowed: boolean;
  reason: GateStatusReason;
  details: {
    tokenType: GateTokenType | string;
    token?: string;
    minimum?: string;
    checked: GatingCheck[];
  };
};
