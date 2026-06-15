#!/usr/bin/env bash
# Naviio — AWS Secrets Manager bootstrap
# Run once to populate all secrets, then reference them via IAM role in the app.
#
# Prerequisites:
#   - AWS CLI configured: aws configure
#   - Sufficient IAM permissions: secretsmanager:CreateSecret, secretsmanager:PutSecretValue
#
# Usage:
#   chmod +x infrastructure/env-setup.sh
#   ./infrastructure/env-setup.sh [--env prod|staging]

set -euo pipefail

ENV="${1:-prod}"
REGION="${AWS_REGION:-us-east-1}"
PREFIX="naviio/${ENV}"

info()  { echo -e "\033[0;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[0;32m[OK]\033[0m    $*"; }
warn()  { echo -e "\033[0;33m[WARN]\033[0m  $*"; }
error() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; exit 1; }

# Verify AWS CLI is available and authenticated
command -v aws >/dev/null 2>&1 || error "AWS CLI not installed. Run: brew install awscli"
aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1 || error "AWS CLI not authenticated. Run: aws configure"

info "Bootstrapping Naviio secrets for environment: ${ENV}"
info "Region: ${REGION}"
info "Prefix: ${PREFIX}"
echo ""

# Helper: create or update a secret
upsert_secret() {
  local name="$1"
  local value="$2"
  local description="$3"

  if aws secretsmanager describe-secret --secret-id "$name" --region "$REGION" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value \
      --secret-id "$name" \
      --secret-string "$value" \
      --region "$REGION" >/dev/null
    ok "Updated: $name"
  else
    aws secretsmanager create-secret \
      --name "$name" \
      --description "$description" \
      --secret-string "$value" \
      --region "$REGION" >/dev/null
    ok "Created: $name"
  fi
}

# ─── Prompt for values (or export env vars before running) ───────────────────

prompt() {
  local var="$1"
  local label="$2"
  local default="${3:-}"
  if [ -z "${!var:-}" ]; then
    read -rsp "  ${label}: " input
    echo ""
    eval "${var}='${input}'"
  else
    ok "${label} already set via environment variable."
  fi
}

echo "── Database ──────────────────────────────────────────"
prompt DB_HOST       "RDS Endpoint (e.g. naviio.xxxx.us-east-1.rds.amazonaws.com)"
prompt DB_PORT       "RDS Port" "5432"
prompt DB_NAME       "Database Name" "naviio"
prompt DB_USER       "Database User" "naviio_app"
prompt DB_PASSWORD   "Database Password"

echo ""
echo "── Redis ─────────────────────────────────────────────"
prompt REDIS_HOST    "ElastiCache Endpoint"
prompt REDIS_PORT    "Redis Port" "6379"

echo ""
echo "── Auth ──────────────────────────────────────────────"
prompt JWT_SECRET_VAL "JWT Secret (min 32 chars)"

echo ""
echo "── Stripe ────────────────────────────────────────────"
prompt STRIPE_SECRET_KEY_VAL    "Stripe Secret Key (sk_live_...)"
prompt STRIPE_WEBHOOK_SECRET_VAL "Stripe Webhook Secret (whsec_...)"

echo ""
echo "── Plaid ─────────────────────────────────────────────"
prompt PLAID_CLIENT_ID_VAL  "Plaid Client ID"
prompt PLAID_SECRET_VAL     "Plaid Secret"

echo ""
echo "── QuickBooks ────────────────────────────────────────"
prompt QB_CLIENT_ID_VAL     "QuickBooks Client ID"
prompt QB_CLIENT_SECRET_VAL "QuickBooks Client Secret"

echo ""
echo "── Anthropic ─────────────────────────────────────────"
prompt ANTHROPIC_API_KEY_VAL "Anthropic API Key (sk-ant-...)"

echo ""
echo "── SendGrid ──────────────────────────────────────────"
prompt SENDGRID_API_KEY_VAL "SendGrid API Key (SG....)"

echo ""
info "Writing secrets to AWS Secrets Manager..."
echo ""

# ─── Database ─────────────────────────────────────────────────────────────────
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}?schema=public&sslmode=require"

upsert_secret "${PREFIX}/database" \
  "{\"host\":\"${DB_HOST}\",\"port\":\"${DB_PORT:-5432}\",\"name\":\"${DB_NAME}\",\"user\":\"${DB_USER}\",\"password\":\"${DB_PASSWORD}\",\"url\":\"${DB_URL}\"}" \
  "Naviio RDS PostgreSQL credentials"

# ─── Redis ────────────────────────────────────────────────────────────────────
upsert_secret "${PREFIX}/redis" \
  "{\"host\":\"${REDIS_HOST}\",\"port\":\"${REDIS_PORT:-6379}\",\"url\":\"redis://${REDIS_HOST}:${REDIS_PORT:-6379}\"}" \
  "Naviio ElastiCache Redis connection"

# ─── JWT ──────────────────────────────────────────────────────────────────────
upsert_secret "${PREFIX}/jwt" \
  "{\"secret\":\"${JWT_SECRET_VAL}\"}" \
  "Naviio JWT signing secret"

# ─── Stripe ───────────────────────────────────────────────────────────────────
upsert_secret "${PREFIX}/stripe" \
  "{\"secretKey\":\"${STRIPE_SECRET_KEY_VAL}\",\"webhookSecret\":\"${STRIPE_WEBHOOK_SECRET_VAL}\"}" \
  "Naviio Stripe API credentials"

# ─── Plaid ────────────────────────────────────────────────────────────────────
upsert_secret "${PREFIX}/plaid" \
  "{\"clientId\":\"${PLAID_CLIENT_ID_VAL}\",\"secret\":\"${PLAID_SECRET_VAL}\",\"env\":\"production\"}" \
  "Naviio Plaid API credentials"

# ─── QuickBooks ───────────────────────────────────────────────────────────────
upsert_secret "${PREFIX}/quickbooks" \
  "{\"clientId\":\"${QB_CLIENT_ID_VAL}\",\"clientSecret\":\"${QB_CLIENT_SECRET_VAL}\"}" \
  "Naviio QuickBooks OAuth credentials"

# ─── Anthropic ────────────────────────────────────────────────────────────────
upsert_secret "${PREFIX}/anthropic" \
  "{\"apiKey\":\"${ANTHROPIC_API_KEY_VAL}\"}" \
  "Naviio Anthropic (Claude) API key"

# ─── SendGrid ─────────────────────────────────────────────────────────────────
upsert_secret "${PREFIX}/sendgrid" \
  "{\"apiKey\":\"${SENDGRID_API_KEY_VAL}\"}" \
  "Naviio SendGrid email API key"

# ─── Print .env.local template ────────────────────────────────────────────────
echo ""
info "All secrets written. Add these to your EC2 instance environment or .env.local:"
echo ""
cat <<ENV
DATABASE_URL="${DB_URL}"
REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT:-6379}"
JWT_SECRET="${JWT_SECRET_VAL}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY_VAL}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET_VAL}"
PLAID_CLIENT_ID="${PLAID_CLIENT_ID_VAL}"
PLAID_SECRET="${PLAID_SECRET_VAL}"
PLAID_ENV="production"
QUICKBOOKS_CLIENT_ID="${QB_CLIENT_ID_VAL}"
QUICKBOOKS_CLIENT_SECRET="${QB_CLIENT_SECRET_VAL}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY_VAL}"
SENDGRID_API_KEY="${SENDGRID_API_KEY_VAL}"
AWS_REGION="${REGION}"
AWS_S3_BUCKET="naviio-reports-${ENV}"
NEXT_PUBLIC_APP_URL="https://app.naviio.com"
ENV

ok "Done! Secrets stored under prefix: ${PREFIX}/"
