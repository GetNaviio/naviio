# Naviio — Production Go-Live Runbook

| Field            | Value                              |
|------------------|------------------------------------|
| **Document ID**  | OPS-RUN-001                        |
| **Owner**        | Eric Franco, CEO                   |
| **Last updated** | June 9, 2026                       |

Plaid Production access is approved. This is the ordered cutover. Steps marked **[you]**
require your credentials / accounts and must be run by you — I don't handle secrets or deploy
on your behalf.

---

## 0. Pre-flight (already done in code)
- ✅ `eslint .` passes project-wide.
- ✅ `tsc` clean except the two new schema fields (resolve at step 3's `db push`).
- ✅ Security hardening: `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY` fail closed in production;
  session cookie is `Secure` in production; MFA enforced; demo backdoor disabled in prod;
  tokens encrypted at rest; webhook signature + body-hash verified.
- ✅ `.env` is gitignored and not tracked.

## 1. Generate secrets **[you]**
```bash
openssl rand -base64 32   # JWT_SECRET
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY   (must stay STABLE forever)
openssl rand -base64 32   # CRON_SECRET
```

## 2. Set production environment variables **[you]** (Vercel → Project → Settings → Environment Variables, "Production" scope)

**Required:**
- `NEXT_PUBLIC_BASE_URL` = `https://<your-domain>`
- `DATABASE_URL` = your Neon **production** connection string
- `JWT_SECRET` = (from step 1)
- `TOKEN_ENCRYPTION_KEY` = (from step 1 — never change it later)
- `CRON_SECRET` = (from step 1)
- `PLAID_CLIENT_ID` = production client id
- `PLAID_SECRET` = **production** secret
- `PLAID_ENV` = `production`
- `PLAID_WEBHOOK_URL` = `https://<your-domain>/api/auth/plaid/webhook`
- `PLAID_REDIRECT_URI` = `https://<your-domain>/integrations/oauth`
- `ANTHROPIC_API_KEY` = (for AI insights)

**Optional — only if that integration is live:** `REDIS_URL` (cache), `STRIPE_*`,
`QB_*`, `XERO_*`, `GUSTO_*`, `ADP_*`, `SHOPIFY_*`, `GHL_*`, `AWS_*` (S3 report storage).
Do **not** set `NGROK_HOST` (dev only).

## 3. Apply the database schema **[you]**
```bash
# with production DATABASE_URL in your shell/.env
npx prisma db push
```
Applies `User.deletedAt` and `Integration.newAccountsAvailable`, and regenerates the client.
After this, `npx tsc --noEmit` is fully clean.

## 4. Register the redirect URI in Plaid **[you]**
Plaid Dashboard → Developers → Allowed redirect URIs → add
`https://<your-domain>/integrations/oauth` (must match `PLAID_REDIRECT_URI` exactly).

## 5. Build + deploy **[you]**
```bash
npm run build          # should pass once step 3 is done
vercel --prod          # or push to your production branch if Git-connected
```
Vercel Cron will pick up `/api/cron/sync` (06:00) and `/api/cron/purge` (04:00) from
`vercel.json` and send the `CRON_SECRET` automatically.

## 6. Post-deploy smoke test **[you]**
- Load the site over HTTPS; register / log in; confirm **MFA challenge** appears when enabled.
- Connect a **real** bank (small/expendable first) → confirm accounts + transactions load.
- Confirm a Plaid **webhook** is received (check logs for `[plaid]` entries).
- `curl -s -o /dev/null -w "%{http_code}" https://<domain>/api/cron/purge` → **401**
  (no secret); with `-H "Authorization: Bearer <CRON_SECRET>"` → **200**.
- Trigger **Settings → Delete account** on a throwaway account → confirm access is disabled.

## 7. Immediately after launch
- **Rotate** any secrets that were ever in local `.env` and shared during development
  (DB password, Anthropic key, Stripe keys) — they should differ from production values.
- Confirm the published **privacy policy** matches the live data you collect (Plaid named,
  Transactions only, no account/routing numbers).

---

## Rollback
- Vercel: promote the previous deployment from the Deployments tab (instant).
- The `db push` is additive (two nullable/defaulted columns) — no destructive rollback needed.
