# Naviio — Security Audit · 2026-06-10

> Consolidated security posture after the full-day hardening session. Earlier
> findings and fixes: [BUG_HUNT.md](./BUG_HUNT.md) (WebAuthn UV, credits
> webhook, refund path) and [CHANGELOG-2026-06-10.md](./CHANGELOG-2026-06-10.md)
> §B. This audit covered the remaining surface: tenant isolation, CSRF,
> injection/SSRF, client exposure, LLM injection, infrastructure, sessions.

## 1. Findings fixed in this audit

### HIGH · Logout did not revoke sessions
**Attack:** steal a session cookie (XSS on a future dependency, device theft,
network capture); the victim "logs out", believing the session dead — but the
stateless JWT stays cryptographically valid for its full 7-day lifetime.
**Fix:** logout now puts the token's SHA-256 hash on a revocation denylist
(Redis cross-instance; in-memory dev) with TTL equal to the token's remaining
lifetime; every session check consults it (`src/lib/auth.ts`,
`api/auth/logout`). *Documented tradeoff:* the check fails open — a Redis
outage must not lock every user out; during such an outage revocation is
temporarily ineffective. Acceptable at this scale; revisit with a Session-table
architecture if threat model hardens.

### MEDIUM-HIGH · Waitlist email dump (PII, broken access control)
**Attack:** register a free account → `GET /api/waitlist` → receive every
signup email ever collected. Marketing-list exfiltration, spear-phishing fuel.
**Fix:** gated on `ADMIN_EMAILS` allowlist (comma-separated, fails closed when
unset). Your `scripts/waitlist.cjs` admin script reads the DB directly and is
unaffected. Set `ADMIN_EMAILS=francoeric34@gmail.com` in prod env.

### LOW · Timing-unsafe cron secret comparison
`===` comparison on the bearer token leaks prefix-match length through response
timing. Both cron routes (`sync`, `purge`) now use `crypto.timingSafeEqual`.

### LOW · Passwordless WebAuthn endpoints unthrottled
`/api/auth/webauthn/login/{options,verify}` are public and had no rate limit
(unlike password login). Assertions are computationally infeasible to forge,
but unmetered challenge generation and credential-id probing are free
reconnaissance. Now rate-limited with the login budget (10/min/IP).

## 2. Verified SAFE (attempted, not exploitable)

| Area | Verdict |
|---|---|
| **Tenant isolation** | Every data route scopes queries by session-derived `orgId`; alerts PATCH includes `orgId` in the WHERE (no IDOR); no route accepts a client-supplied orgId. `withOrg` standardizes this. |
| **SQL injection** | No raw SQL anywhere (`$queryRaw`/`$executeRaw` absent); Prisma parameterizes everything. QBO query strings interpolate only internal constants. |
| **CSRF** | Analyzed route-by-route, not dogmatically: SameSite=Lax means cross-site form POSTs don't carry the session cookie, and cross-site JSON POSTs fail preflight. MFA verify takes identity from the server-set pre-auth cookie, never the body. CSP `form-action 'self'` backs this. **CSRF tokens are not currently needed** — revisit if SameSite=None ever becomes necessary. |
| **Open redirect** | No redirect/next/return query params anywhere; OAuth callbacks redirect only to hardcoded paths. |
| **SSRF** | GHL `nextPageUrl` pagination extracts pathname+query only and re-bases onto the GHL API host — attacker-supplied hosts are discarded. |
| **Client-side exposure** | Only `NEXT_PUBLIC_BASE_URL` reaches the client; tokens/secrets server-side only; session JWT httpOnly. |
| **LLM prompt injection** | Navi/commentary prompts contain only **aggregated numbers** — attacker-controllable transaction descriptions/merchant names never reach the model, and model output is display-only (no tool use). |
| **Infrastructure** | Dockerfile: non-root, multi-stage, no secrets in layers. CI: no `pull_request_target`, secrets never echoed. Headers: HSTS+preload, X-Frame-Options DENY, nosniff, Permissions-Policy, Referrer-Policy. `/api/health` discloses nothing. |
| **Account deletion** | `deletedAt` checked on every session resolution — deleted users are locked out immediately, including via OAuth re-entry (both provider-link and email-match branches reject). |
| **Webhooks** | Stripe + Plaid signatures verified against the raw body before parsing; credit grants idempotent on unique `stripeRef`. |
| **MFA integrity** | Pre-auth (mfaPending) tokens are never accepted as sessions and vice versa — now pinned by tests (`tests/lib/auth-tokens.test.ts`), including forged-claim attempts. Passwordless passkeys require user verification (PIN/biometric). |

## 3. Accepted risks / recommendations (not fixed)

1. **CSP `unsafe-inline`/`unsafe-eval`** (next.config.ts, documented TODO) —
   needed for Next's bootstrap today; migrate to nonce-based script-src
   post-launch. Mitigated by: no user-generated HTML rendered anywhere.
2. **Revocation fails open** on Redis outage (see §1) — by design.
3. **Account enumeration** — register returns 409 "account already exists".
   Standard UX tradeoff; rate limiting (5/min) bounds harvesting speed.
4. **`.env.save`** — stale secrets copy in the project folder. Gitignored
   (`.env*`), but delete it: `rm .env.save`. Same rotation requirement as
   `.env` (changelog §F-1).
5. **`npm audit`: 11 advisories (1 low, 10 moderate)** from your install
   output — run `npm audit` and review; majority are usually dev-chain. Do
   before launch.
6. **Concurrent sessions** — unlimited, no device management. Fine now; add
   a sessions view + "log out everywhere" (trivial with the denylist: bump a
   per-user epoch) when teams arrive.
7. **No structured audit log** — auth events (login, MFA, deletion) go to
   console only. Add an `AuditEvent` table before SOC 2 conversations.

## 4. Defense-in-depth summary (current posture)

Boot-time env validation → TLS+HSTS → rate-limited public endpoints
(login/register/waitlist/MFA/passkey) → zod input validation → JWT sessions
(httpOnly, SameSite=Lax, revocable on logout) → MFA with strict pre-auth/session
separation → UV-enforced passkeys → org-scoped queries via `withOrg` →
AES-256-GCM token encryption at rest → signature-verified webhooks →
idempotent, atomic money operations (append-only ledger) → soft-delete with
immediate access cutoff → non-root container, secretless CI, timing-safe cron
auth. Auth/money invariants enforced by 26 test suites.
