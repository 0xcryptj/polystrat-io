import type { TraderProfile } from "./types.js";

// In-memory store (process lifetime). No persistence by design (for now).
const traders = new Map<string, TraderProfile>();

export function listTraders(): TraderProfile[] {
  return Array.from(traders.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function upsertTrader(input: { address: string; nickname?: string }): TraderProfile {
  const address = normalizeAddress(input.address);
  const existing = traders.get(address);

  const profile: TraderProfile = existing
    ? { ...existing, nickname: input.nickname ?? existing.nickname }
    : {
        address,
        nickname: input.nickname,
        createdAt: Date.now(),
        tags: [],
        status: "active"
      };

  traders.set(address, profile);
  return profile;
}

export function deleteTrader(address: string): boolean {
  return traders.delete(normalizeAddress(address));
}

export function getTrader(address: string): TraderProfile | null {
  return traders.get(normalizeAddress(address)) ?? null;
}

function normalizeAddress(addr: string): string {
  if (!addr) throw new Error("missing address");
  return addr.trim().toLowerCase();
}
