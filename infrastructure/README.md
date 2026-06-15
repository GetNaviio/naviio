# Naviio — AWS Infrastructure

## Architecture Overview

```
Internet
   │
   ▼
CloudFront (CDN)
   │
   ├─► S3 (static assets, report PDFs)
   │
   └─► EC2 t3.medium (Next.js app + API)
          │
          ├─► RDS PostgreSQL db.t3.micro
          ├─► ElastiCache Redis t3.micro
          ├─► Secrets Manager (API keys)
          └─► Lambda (async jobs)
```

---

## Services

### EC2 — API / App Server
| Setting      | Value            |
|--------------|------------------|
| Instance     | t3.medium        |
| OS           | Amazon Linux 2023 |
| vCPU         | 2                |
| RAM          | 4 GB             |
| Storage      | 30 GB gp3        |
| Environment  | Production       |

- Runs the Next.js app via `pm2`
- Sits behind an Application Load Balancer (ALB)
- Auto-scaling group: min 1, max 4 instances
- Security group: inbound 443 (ALB only), outbound all

### RDS — PostgreSQL
| Setting      | Value               |
|--------------|---------------------|
| Instance     | db.t3.micro         |
| Engine       | PostgreSQL 16       |
| Storage      | 20 GB gp3, autoscale to 100 GB |
| Multi-AZ     | No (upgrade for HA) |
| Backups      | 7-day retention     |

- Private subnet only (no public access)
- Credentials stored in Secrets Manager
- Connection via `DATABASE_URL` env var (Prisma)

### ElastiCache — Redis
| Setting      | Value         |
|--------------|---------------|
| Instance     | cache.t3.micro |
| Engine       | Redis 7.x     |
| Nodes        | 1 (single)    |

- Used for: API response caching, rate limiting, session store
- Private subnet only
- Connection via `REDIS_URL` env var

### S3 — Report Storage
| Setting      | Value                     |
|--------------|---------------------------|
| Bucket       | `naviio-reports-{env}`    |
| Access       | Private (pre-signed URLs) |
| Versioning   | Enabled                   |
| Lifecycle    | Archive to Glacier after 90 days |

- Stores generated PDF reports
- CloudFront origin for CDN delivery
- Server-side encryption (SSE-S3)

### CloudFront — CDN
- Origin: S3 bucket + EC2 ALB
- SSL: ACM certificate (naviio.com)
- Caching: static assets 1 year, API 0
- WAF attached (rate limiting, geo-blocking)

### Lambda — Async Jobs
| Function              | Trigger              | Timeout |
|-----------------------|----------------------|---------|
| `report-generator`    | SQS queue            | 5 min   |
| `integration-sync`    | EventBridge (hourly) | 3 min   |
| `alert-evaluator`     | EventBridge (15 min) | 1 min   |
| `invoice-processor`   | S3 event             | 2 min   |

- Runtime: Node.js 20.x
- Memory: 512 MB
- Environment variables from Secrets Manager

### Secrets Manager
All sensitive credentials stored as JSON secrets:

| Secret Name                    | Contents                          |
|-------------------------------|-----------------------------------|
| `naviio/prod/database`        | DB host, port, name, user, pass   |
| `naviio/prod/stripe`          | Secret key, webhook secret        |
| `naviio/prod/plaid`           | Client ID, secret, env            |
| `naviio/prod/quickbooks`      | Client ID, client secret          |
| `naviio/prod/jwt`             | JWT secret key                    |
| `naviio/prod/openai`          | API key                           |
| `naviio/prod/anthropic`       | API key                           |
| `naviio/prod/sendgrid`        | API key                           |

---

## Environment Variables

See `env-setup.sh` for the complete list.  
Copy `.env.example` → `.env.local` for local development.

| Variable                  | Source             | Description                     |
|---------------------------|--------------------|---------------------------------|
| `DATABASE_URL`            | Secrets Manager    | Prisma connection string        |
| `REDIS_URL`               | Secrets Manager    | Redis connection string         |
| `JWT_SECRET`              | Secrets Manager    | Session signing key             |
| `STRIPE_SECRET_KEY`       | Secrets Manager    | Stripe API key                  |
| `STRIPE_WEBHOOK_SECRET`   | Secrets Manager    | Stripe webhook signing secret   |
| `PLAID_CLIENT_ID`         | Secrets Manager    | Plaid client ID                 |
| `PLAID_SECRET`            | Secrets Manager    | Plaid secret                    |
| `PLAID_ENV`               | App config         | `sandbox` / `production`        |
| `QUICKBOOKS_CLIENT_ID`    | Secrets Manager    | QuickBooks OAuth client ID      |
| `QUICKBOOKS_CLIENT_SECRET`| Secrets Manager    | QuickBooks OAuth secret         |
| `ANTHROPIC_API_KEY`       | Secrets Manager    | Claude API key                  |
| `AWS_S3_BUCKET`           | App config         | Report storage bucket name      |
| `AWS_REGION`              | App config         | `us-east-1`                     |
| `NEXT_PUBLIC_APP_URL`     | App config         | `https://app.naviio.com`        |

---

## Deployment

### Initial Setup
```bash
# 1. Bootstrap secrets
chmod +x infrastructure/env-setup.sh
./infrastructure/env-setup.sh

# 2. Run DB migrations
npx prisma migrate deploy

# 3. Build and start
npm run build
pm2 start npm --name "naviio" -- start
```

### CI/CD (GitHub Actions)
- Push to `main` → deploy to production
- Push to `dev` → deploy to staging
- Migrations run automatically on deploy
- Zero-downtime rolling deploy via ALB

---

## Estimated Monthly Cost (Production)

| Service          | Cost/mo  |
|------------------|----------|
| EC2 t3.medium    | ~$30     |
| RDS db.t3.micro  | ~$15     |
| ElastiCache t3.micro | ~$12 |
| S3 + CloudFront  | ~$5      |
| Lambda           | ~$2      |
| Secrets Manager  | ~$4      |
| ALB              | ~$18     |
| **Total**        | **~$86** |
