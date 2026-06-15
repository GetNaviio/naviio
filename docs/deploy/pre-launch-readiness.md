# Naviio — Pre-Launch Readiness Checklist

| Field | Value |
|---|---|
| **Document ID** | OPS-CHK-001 |
| **Owner** | Eric Franco, CEO |
| **Last updated** | June 9, 2026 |

Living checklist for launching Naviio (financial app, AWS ECS Fargate, Neon). **[done]** =
built/verified this far; **[todo]** = outstanding; **[you]** = needs your action/accounts.

## A. Application security (code)
- [done] MFA enforced at login; demo backdoor disabled in prod; session cookie `Secure` in prod.
- [done] App-layer token encryption (AES-256-GCM); `JWT_SECRET` / `TOKEN_ENCRYPTION_KEY` fail closed in prod.
- [done] Plaid webhook signature + body-hash verification.
- [done] Account deletion + nightly retention purge.
- [todo] **Security headers** — HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. None set today (policy claims HSTS — currently false).
- [todo] **Fix CORS** — `Access-Control-Allow-Origin: *` with credentials is invalid/insecure; lock to the app origin.
- [todo] **Rate limiting** — brute-force protection on `/api/auth/login`, `/mfa/verify`, `/register` (Redis-backed; `REDIS_URL` already used).
- [todo] **`npm audit`** clean (run on a networked machine; critical vulns block launch).

## B. Observability & ops
- [done] CloudWatch logs (90-day retention) wired in Terraform.
- [todo] **Error tracking** (e.g. Sentry) — today errors only hit console/CloudWatch.
- [todo] **Alerting** — CloudWatch alarms → SNS (5xx rate, task health, cron failures).
- [todo] **Uptime monitoring** (external probe on `/api/health`).

## C. Reliability / scale
- [todo] **ECS service autoscaling** (CPU/memory target tracking).
- [todo] **Cron sync scalability** — batch/queue large org counts (single invocation today).
- [todo] [you] **Neon backups / PITR** — confirm enabled on the production project.
- [todo] Graceful shutdown / connection draining sanity check.

## D. AWS infrastructure (Terraform — foundation done, hardening todo)
- [done] VPC, ECS Fargate, ALB (HTTPS), ECR, Secrets Manager, KMS, EventBridge crons.
- [todo] **WAF** on the ALB (policy references it) — managed rules + rate rule.
- [todo] [you] **GuardDuty + CloudTrail** enabled (policy references both).
- [todo] [you] **ACM certificate** issued + validated for the domain.
- [todo] [you] **Terraform state backend** (encrypted S3 + DynamoDB lock).
- [todo] Secrets rotation policy (esp. non-`TOKEN_ENCRYPTION_KEY` secrets).

## E. Compliance / legal
- [done] Plaid attestations, diligence map + questionnaire, privacy/terms published, retention + offboarding implemented, policy reconciled to Neon/Fargate.
- [todo] [you] Fill diligence questionnaire facts (EIN, legal entity, headcount).
- [todo] [you] Confirm **background checks** + **pen test** actually performed (policy now states them).
- [todo] Cookie/consent banner if serving EU/UK users.

## F. Product / business
- [todo] [you] **Billing** — do you charge customers? (Stripe billing + `Plan` enum exists; subscription flow not wired.)
- [todo] **Transactional email** — account-deletion confirmation (policy §5.2 promises it), alerts, verification. No email provider wired today.
- [todo] New-user onboarding flow review.
- [todo] [you] Support channel / inbox.

## G. Final QA gate
- [todo] End-to-end test: register → MFA → connect real bank → see live dashboard → disconnect → delete account.
- [todo] Load test at expected launch volume.
- [todo] `eslint` / `tsc` / `npm test` / `npm run build` all green (tsc clears after `prisma db push`).

---

## Recommended critical path (must-have before first customer)
1. **A** — security headers, CORS fix, rate limiting, `npm audit`. *(code, build now)*
2. **D** — WAF, ACM, state backend, GuardDuty/CloudTrail. *(infra, your accounts)*
3. **B** — error tracking + basic alarms.
4. **F** — transactional email (at least deletion confirmation), billing decision.
5. **G** — full end-to-end QA on production before announcing.

"Soon after launch" (not blockers): autoscaling, cron batching, load testing, cookie banner.
