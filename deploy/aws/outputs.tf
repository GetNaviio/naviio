output "ecr_repository_url" {
  description = "Push your image here"
  value       = aws_ecr_repository.app.repository_url
}

output "alb_dns_name" {
  description = "Point your domain's DNS (CNAME/ALIAS) at this"
  value       = aws_lb.app.dns_name
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_name" {
  value = aws_ecs_service.app.name
}

output "secret_names" {
  description = "Set values for these via `aws secretsmanager put-secret-value`"
  value       = [for s in aws_secretsmanager_secret.app : s.name]
}
