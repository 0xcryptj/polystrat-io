# Supabase Wallet Linking Table (RLS)

Create a table `wallets` for linking read-only wallet addresses to a logged-in user.

## Table

Run this in **Supabase SQL editor**:

```sql
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  chain text not null check (chain in ('evm','sol')),
  address text not null,
  created_at timestamptz not null default now()
);

create index if not exists wallets_user_id_idx on public.wallets(user_id);
create unique index if not exists wallets_unique_user_chain_address on public.wallets(user_id, chain, address);
```

## RLS

```sql
alter table public.wallets enable row level security;

create policy "wallets_select_own" on public.wallets
for select
using (auth.uid() = user_id);

create policy "wallets_insert_own" on public.wallets
for insert
with check (auth.uid() = user_id);

create policy "wallets_delete_own" on public.wallets
for delete
using (auth.uid() = user_id);
```

Notes:
- We rely on the **user JWT** hitting the API endpoints; the API uses the JWT when calling Supabase so RLS applies.
- This is read-only linking (no trading) and stores **no signatures**.
