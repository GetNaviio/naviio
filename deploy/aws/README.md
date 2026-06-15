# Naviio on AWS — ECS Fargate deploy

| Field | Value |
|---|---|
| **Document ID** | OPS-RUN-002 |
| **Owner** | Eric Franco, CEO |

Containerized Next.js on **ECS Fargate** behind an **ALB**, in a private subnet, with
secrets in **Secrets Manager**, logs/ECR/secrets encrypted by **KMS**, and scheduled jobs on
**EventBridge** (replacing the Vercel crons). The database stays on **Neon** (no RDS).

> This Terraform is a reviewed foundation, written without a live AWS account to validate
> against. **Run `terraform init && terraform validate && terraform plan` first** and review
> the plan before `apply`. Steps below need your AWS credentials and account — they are yours
> to run; the assistant does not provision cloud resources or handle secrets.

## Prerequisites
- AWS account + `aws` CLI configured (admin or scoped deploy role).
- Terraform ≥ 1.6, Docker.
- A domain you control + an **ACM certificate** in the same region, validated (DNS).
- Your **Neon production** connection string.

## 1. Backend state (recommended)
Create an encrypted S3 bucket + DynamoDB lock table, then uncomment the `backend "s3"` block
in `versions.tf`. State holds the cron Bearer value, so it must be encrypted + private.

## 2. First apply (creates ECR, VPC, ALB, cluster, secrets containers)
```bash
cd deploy/aws
cp terraform.tfvars.example terraform.tfvars   # fill in; keep out of git
terraform init
terraform plan
terraform apply
```
`container_image` won't exist yet — set it to the ECR URL with `:latest`; the service will
stabilize after step 4.

## 3. Set secret VALUES (never in Terraform)
```bash
ACCT=$(aws sts get-caller-identity --query Account --output text)
for s in DATABASE_URL JWT_SECRET TOKEN_ENCRYPTION_KEY CRON_SECRET PLAID_CLIENT_ID PLAID_SECRET ANTHROPIC_API_KEY; do
  aws secretsmanager put-secret-value --secret-id "naviio/$s" --secret-string "<value>"
done
```
- `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`: `openssl rand -base64 32` each.
- `TOKEN_ENCRYPTION_KEY` must stay **stable forever**; `CRON_SECRET` must equal the
  `cron_secret` in `terraform.tfvars`.
- `PLAID_*` = your **production** Plaid credentials.

## 4. Build, push, deploy the image
```bash
REPO=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%/*}"
# Build for linux/amd64 (Fargate) — important if you build on Apple Silicon:
docker build --platform linux/amd64 -t "$REPO:latest" ../..
docker push "$REPO:latest"
aws ecs update-service --cluster naviio --service naviio --force-new-deployment
```
The Docker build runs `prisma generate` + `npm run build`; the **DB migration**
(`User.deletedAt`, `Integration.newAccountsAvailable`) is applied separately against Neon:
```bash
DATABASE_URL="<neon-prod-url>" npx prisma db push   # run once from your machine
```

## 5. DNS + TLS
Point `domain_name` at the ALB:
```bash
terraform output alb_dns_name   # create a CNAME/ALIAS record to this
```
Confirm the ACM cert covers the domain (referenced by `acm_certificate_arn`).

## 6. Plaid dashboard
Register `https://<domain>/integrations/oauth` as an allowed redirect URI; confirm the webhook
URL `https://<domain>/api/auth/plaid/webhook` matches `PLAID_WEBHOOK_URL`.

## 7. Smoke test
- `curl https://<domain>/api/health` → `{"status":"ok"}`.
- Log in + MFA; connect one **real, expendable** bank; confirm transactions load.
- Confirm a Plaid webhook arrives (CloudWatch `/ecs/naviio` logs).
- `aws events test-event-pattern`… or just wait for the scheduled runs / temporarily set the
  rule to `rate(5 minutes)` to confirm `/api/cron/*` is invoked (then restore the cron).

## Cost note
Fixed monthly baseline is dominated by NAT Gateway (~$32), ALB (~$18), and 2 Fargate tasks
(~$36). Set `single_nat_gateway = false` only when you need NAT HA. Neon stays separate.

## Rollback
`aws ecs update-service --cluster naviio --service naviio --task-definition <previous-arn>`
or push a previous image tag and force a new deployment.
