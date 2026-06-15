variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "app_name" {
  description = "Base name for resources"
  type        = string
  default     = "naviio"
}

variable "domain_name" {
  description = "Public domain the app serves on (e.g. app.naviio.com)"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of an ACM cert in this region covering domain_name (validated out-of-band)"
  type        = string
}

variable "container_image" {
  description = "Full ECR image URI:tag to deploy (set after the first push, e.g. <acct>.dkr.ecr.<region>.amazonaws.com/naviio:latest)"
  type        = string
}

variable "desired_count" {
  description = "Number of Fargate tasks"
  type        = number
  default     = 2
}

variable "task_cpu" {
  description = "Fargate task CPU units (256/512/1024/...)"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory (MiB)"
  type        = number
  default     = 1024
}

variable "vpc_cidr" {
  description = "VPC CIDR"
  type        = string
  default     = "10.0.0.0/16"
}

# Names of the Secrets Manager secrets the app reads. Values are NOT set here —
# create them out-of-band (see README) so secret material never lands in TF state.
variable "app_secret_names" {
  description = "Logical name → Secrets Manager secret name for env injection"
  type        = map(string)
  default = {
    DATABASE_URL          = "naviio/DATABASE_URL"
    JWT_SECRET            = "naviio/JWT_SECRET"
    TOKEN_ENCRYPTION_KEY  = "naviio/TOKEN_ENCRYPTION_KEY"
    CRON_SECRET           = "naviio/CRON_SECRET"
    PLAID_CLIENT_ID       = "naviio/PLAID_CLIENT_ID"
    PLAID_SECRET          = "naviio/PLAID_SECRET"
    ANTHROPIC_API_KEY     = "naviio/ANTHROPIC_API_KEY"
  }
}

# Non-secret env vars passed to the container.
variable "app_env" {
  description = "Plain (non-secret) environment variables for the app"
  type        = map(string)
  default     = {}
  # Set in tfvars, e.g.:
  # app_env = {
  #   NODE_ENV            = "production"
  #   NEXT_PUBLIC_BASE_URL = "https://app.naviio.com"
  #   PLAID_ENV           = "production"
  #   PLAID_WEBHOOK_URL   = "https://app.naviio.com/api/auth/plaid/webhook"
  #   PLAID_REDIRECT_URI  = "https://app.naviio.com/integrations/oauth"
  # }
}

variable "cron_secret" {
  description = "CRON_SECRET value, used by EventBridge to authorize calls to /api/cron/*. Sensitive — keep TF state encrypted."
  type        = string
  sensitive   = true
}
