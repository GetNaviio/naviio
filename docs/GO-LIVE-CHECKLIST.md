# Go-Live Checklist

Practical steps to flip Naviio from sandbox/test to production. Grows over time;
today it captures the Stripe/integrations items surfaced during sandbox testing.

## Stripe (payments)

- [ ] **Swap to live keys.** In production env (Vercel), set `STRIPE_SECRET_KEY=sk_live_…`
      and `STRIPE_CLIENT_ID=ca_live_…` (the **live**-mode Connect client ID — it
      differs from the test one). `STRIPE_PUBLISHABLE_KEY` is unused (server-side
      only) and can stay blank.
- [ ] **Register the live webhook.** In the live Stripe Dashboard, add the webhook
      endpoint(s) and set `STRIPE_WEBHOOK_SECRET` (and `STRIPE_CREDITS_WEBHOOK_SECRET`
      for `/api/credits/webhook`). Without this, updates between cron runs aren't
      real-time. The handler already exists — this is config only.
- [ ] **Enable Connect OAuth + redirect URI.** Stripe Dashboard → Connect → OAuth:
      turn on OAuth and add the production redirect URI
      `https://www.naviio.com/api/auth/stripe/callback`. The app derives the
      redirect from the request origin, so this just has to be allow-listed.
- [ ] **Decide the initial backfill window.** First sync pulls only the last ~90
      days of charges into the ledger (`syncStripeData`, `sinceTs(90)`). Fine for a
      young SaaS; widen it if you'll onboard established businesses with years of
      history.

## Cleanup before launch

- [ ] **Remove the temporary key-paste UI.** Delete `TempStripeKeyConnect.tsx`, its
      use in `integrations/page.tsx`, and `NEXT_PUBLIC_STRIPE_KEY_CONNECT`.
      (A scheduled task is set to do this automatically; verify it ran.)
- [ ] **Clear sandbox test data.** Test-clock customers/subscriptions created during
      seeding linger in the Stripe sandbox (invisible to Naviio but present in the
      Dashboard). Delete the test clocks before relying on real data.
- [ ] **Drop test env flags.** Remove `NEXT_PUBLIC_STRIPE_KEY_CONNECT` and any leftover
      `NGROK_HOST`/ngrok redirect URIs from all environments.

## Verify the automatic sync paths

- [ ] **Daily cron.** `/api/cron/sync` (vercel.json, `0 6 * * *`) runs the orchestrator
      → persists Stripe charges. Confirm `CRON_SECRET` is set in production.
- [x] **Sync Now persists charges** — fixed (`fetchStripeData` now calls `syncStripeData`).
- [x] **Auto-sync on connect** — fixed (OAuth callback `postConnect` + key flow sync
      immediately, so the dashboard is populated when the user lands back).

## Other integrations (extend as needed)

- [ ] Plaid: production credentials + `PLAID_REDIRECT_URI` on the real domain.
- [ ] QuickBooks / Xero: live OAuth app credentials + production redirect URIs.
- [ ] Confirm `JWT_SECRET`, `ENCRYPTION_KEY`, and `DATABASE_URL` are the production values.
