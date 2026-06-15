terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Recommended: store state in an encrypted S3 bucket with a DynamoDB lock table.
  # State will contain sensitive values (cron secret connection) — keep it private
  # and encrypted. Configure and uncomment before `terraform init`.
  #
  # backend "s3" {
  #   bucket         = "naviio-tfstate"
  #   key            = "prod/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "naviio-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "naviio"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
