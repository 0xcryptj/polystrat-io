export type WalletChain = "evm" | "sol";

export type LinkedWallet = {
  id: string;
  user_id: string;
  chain: WalletChain;
  address: string;
  created_at: string;
};
