data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = var.app_name
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
}

# ─── Network ───────────────────────────────────────────────────────────────────
# Public subnets host the ALB + NAT; private subnets host the Fargate tasks so the
# app has no public IP. NAT lets tasks reach Plaid/Stripe/Neon/npm outbound.
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${local.name}-vpc"
  cidr = var.vpc_cidr
  azs  = local.azs

  public_subnets  = [cidrsubnet(var.vpc_cidr, 8, 0), cidrsubnet(var.vpc_cidr, 8, 1)]
  private_subnets = [cidrsubnet(var.vpc_cidr, 8, 10), cidrsubnet(var.vpc_cidr, 8, 11)]

  enable_nat_gateway   = true
  single_nat_gateway   = true # one NAT to save cost; set false for HA
  enable_dns_hostnames = true
}

# ─── ECR ───────────────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "app" {
  name                 = local.name
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ─── KMS (encrypts secrets, logs, ECR) ─────────────────────────────────────────
resource "aws_kms_key" "main" {
  description             = "${local.name} encryption key"
  deletion_window_in_days = 14
  enable_key_rotation     = true
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.main.key_id
}

# ─── CloudWatch logs ───────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name}"
  retention_in_days = 90 # matches SEC-POL-003 log retention
  kms_key_id        = aws_kms_key.main.arn
}
