# Supabase Setup (Email Auth)

This project uses **Supabase Auth** for email/password sign up and sign in.

## 1) Create a Supabase project

1. Create a new Supabase project in the Supabase dashboard.
2. In your project, go to **Project Settings → API**.

You need:
- **Project URL** (looks like `https://<ref>.supabase.co`)
- **anon public key**

## 2) Configure Auth providers

Go to **Authentication → Providers → Email** and ensure Email auth is enabled.

## 3) Set environment variables locally

### Web (Vite)

Create `apps/web/.env.local`:

```bash
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

### API (Node)

Create `apps/api/.env.local`:

```bash
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

> Never commit `.env.local`. Keep secrets local.

## 4) Run

```bash
npm -w apps/api run dev
npm -w apps/web run dev
```

## Wallet linking table

If you’re doing the wallet-linking task, also create the `wallets` table + RLS.

See: `docs/supabase-wallets.md`

## 5) Verify

1. Open `http://127.0.0.1:5173/#login`
2. Sign up, then sign in.
3. Confirm Markets is gated behind auth.
4. Call API:

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:3399/me
```

You should see `{ userId, email }`.
