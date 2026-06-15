# 0032 — Deploy target: AWS ECS Fargate

- **Date:** 2026-06-09
- **Status:** accepted (build-first; launch directly on AWS)
- **Owner (DRI):** CEO + security-legal-specialist

## Context
User chose to launch on AWS rather than Vercel (option B: build AWS first), for compliance/
control, KMS-backed key management, VPC isolation, and to escape serverless function timeouts.
Architecture: **ECS Fargate** (containers) over SST/serverless, since the app is webhook- and
cron-heavy and benefits from an always-on server. Database stays on **Neon** (no RDS migration).

## What was built (this repo)
- **Containerization:** `next.config.ts` `output: "standalone"`; multi-stage `Dockerfile`
  (Node 22, non-root, runs `prisma generate` + `npm run build`, healthcheck); `.dockerignore`;
  `GET /api/health` (light 200, no DB hit) for the ALB target group.
- **Terraform (`deploy/aws/`):** VPC (public/private + NAT) via the community module; ECR with
  scan-on-push + KMS; ECS cluster + Fargate service/task (private subnet, awsvpc); ALB with
  HTTPS (ACM) + HTTP→HTTPS redirect; security groups (ALB public, service ALB-only); IAM
  execution/task roles; Secrets Manager containers (values set out-of-band) + KMS; CloudWatch
  logs (90-day retention); **EventBridge** rules + API Destinations replacing the Vercel crons
  (`/api/cron/sync` 06:00, `/api/cron/purge` 04:00) authorized with `CRON_SECRET`.
- **Runbook:** `deploy/aws/README.md` (OPS-RUN-002) — state backend, apply, secret values,
  image build/push, DNS/ACM, Plaid dashboard, smoke test, rollback.
- **Policy reconciliation:** `SEC-POL-001` §3 now says **Neon** (not RDS) for data-at-rest,
  **AWS ECS Fargate** for compute, and corrects the KMS scope (S3/ECR/logs/Secrets Manager;
  Neon manages its own storage keys; token key in Secrets Manager).

## Boundaries / honesty
- The Terraform is a reviewed foundation written **without a live AWS account to validate**.
  It must be `terraform init/validate/plan`-reviewed before apply; treat as a strong starting
  point, not guaranteed-apply.
- Provisioning (AWS account, credentials, `terraform apply`, secret values, image push, DNS)
  is done by the user — the assistant does not handle credentials or touch the cloud account.
- `vercel.json` crons are superseded by EventBridge on AWS (left in repo; harmless if unused).

## Verification
- `eslint .` — 0. `tsc` — only the pending `db push` field errors; no regressions.
- Docker/Terraform not runnable in the build sandbox; validated by review + the runbook's
  plan/validate gate.

## Follow-ups
- Fix the `next.config` CORS (`Access-Control-Allow-Origin: *` with credentials) before prod —
  lock to the app origin. (Flagged, not yet done.)
- Optional NAT-HA (`single_nat_gateway = false`) and autoscaling once traffic warrants.
