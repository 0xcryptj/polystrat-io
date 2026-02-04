export type TraderProfile = {
  address: string;
  nickname?: string;
  createdAt: number;
  tags: string[];
  status: "active" | "paused";
};
