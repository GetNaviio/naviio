# Vercel Production Environment Variables

Reference for a clean reset of Production env vars on Vercel (www.naviio.com).
Set each in **Settings → Environment Variables → Production**, then **Redeploy**.

No secret VALUES are written here — only where each one comes from.

## 1. Required for the app to boot (login breaks if any is wrong)

| Key | Production value / source |
|-----|---------------------------|
| `DATABASE_URL` | The **pooled** Neon connection string (host contains `-pooler`, ends `?sslmode=require`). Copy the FULL string from the Neon dashboard. **This is the #1 suspect for the login "server error" — verify it is complete and not truncated.** |
| `JWT_SECRET` | A long random string. Generate fresh for prod: `openssl rand -hex 32`. Does NOT need to match local. |
| `TOKEN_ENCRYPTION_KEY` | **Must match the value in `.env.local`** (same DB ⇒ same key, or stored Plaid/Stripe tokens become unreadable). Copy from `.env.local`. |
| `NEXT_PUBLIC_BASE_URL` | `https://www.naviio.com` |
| `COOKIE_DOMAIN` | `.naviio.com`  (leading dot — fixes the apex↔www login bounce) |
| `NODE_ENV` | Leave UNSET — Vercel sets it to `production` automatically. |

## 2. Plaid

| Key | Production value / source |
|-----|---------------------------|
| `PLAID_CLIENT_ID` | From Plaid dashboard. |
| `PLAID_SECRET` | The secret for the env below (sandbox vs production are different secrets). |
| `PLAID_ENV` | `sandbox` (until you're approved for production). |
| `PLAID_REDIRECT_URI` | `https://www.naviio.com/integrations/oauth` — and register this EXACT URL in Plaid → Developers → API → Allowed redirect URIs. If you can't register it yet, leave this **blank** (link tokens still work without OAuth banks). |
| `PLAID_WEBHOOK_URL` | `https://www.naviio.com/api/auth/plaid/webhook` |

## 3. Stripe

| Key | Production value / source |
|-----|---------------------------|
| `STRIPE_SECRET_KEY` | From Stripe (match test/live to the mode you're using). |
| `STRIPE_PUBLISHABLE_KEY` | From Stripe. |
| `STRIPE_CLIENT_ID` | `ca_...` (Connect) from Stripe. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from the Stripe webhook endpoint. |
| `STRIPE_REDIRECT_URI` | `https://www.naviio.com/api/auth/stripe/callback` — register this in Stripe → Connect → settings. |
| Price IDs (`STRIPE_PLAN_PRICE_*`, `STRIPE_FIRM_PRICE_*`) | From `scripts/stripe-plan-prices.cjs` / `stripe-firm-prices.cjs` output. Optional unless testing billing. |
| Webhook secrets (`STRIPE_CONNECT_WEBHOOK_SECRET`, etc.) | Fall back to `STRIPE_WEBHOOK_SECRET` if unset — optional. |

## 4. Other (copy from .env.local as-is)

`ANTHROPIC_API_KEY`, `CRON_SECRET`, `FAL_KEY`, `DROPBOX_*` (set redirect to
`https://www.naviio.com/api/auth/dropbox/callback`), `ADMIN_EMAILS`.

---

### After redeploy
1. Try to log in. If it still fails, open **Vercel → Logs (Runtime)**, retry login,
   and copy the `login route error:` line — that prints the exact cause.
2. Once login works, revert the two temporary debug commits (Plaid always-detail;
   login error logging).
