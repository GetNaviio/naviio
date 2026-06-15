# Secret containers. Terraform owns the container + KMS key; the VALUES are set
# out-of-band (see README) so secret material never lands in Terraform state.
resource "aws_secretsmanager_secret" "app" {
  for_each   = var.app_secret_names
  name       = each.value
  kms_key_id = aws_kms_key.main.arn
}
