# ─── Scheduled jobs — replaces vercel.json crons ──────────────────────────────
# EventBridge calls the app's own cron endpoints over HTTPS via an API Destination,
# authorized with the CRON_SECRET as a Bearer header (the same check the routes use).
# vercel.json crons are not used on AWS.

resource "aws_cloudwatch_event_connection" "cron" {
  name               = "${local.name}-cron"
  authorization_type = "API_KEY"
  auth_parameters {
    api_key {
      key   = "Authorization"
      value = "Bearer ${var.cron_secret}"
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "sync" {
  name                = "${local.name}-sync"
  connection_arn      = aws_cloudwatch_event_connection.cron.arn
  invocation_endpoint = "https://${var.domain_name}/api/cron/sync"
  http_method         = "POST"
}

resource "aws_cloudwatch_event_api_destination" "purge" {
  name                = "${local.name}-purge"
  connection_arn      = aws_cloudwatch_event_connection.cron.arn
  invocation_endpoint = "https://${var.domain_name}/api/cron/purge"
  http_method         = "GET"
}

# Role allowing EventBridge to invoke the API destinations.
data "aws_iam_policy_document" "events_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cron" {
  name               = "${local.name}-cron"
  assume_role_policy = data.aws_iam_policy_document.events_assume.json
}

resource "aws_iam_role_policy" "cron_invoke" {
  name = "${local.name}-cron-invoke"
  role = aws_iam_role.cron.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["events:InvokeApiDestination"]
      Resource = [
        aws_cloudwatch_event_api_destination.sync.arn,
        aws_cloudwatch_event_api_destination.purge.arn,
      ]
    }]
  })
}

# Sync — daily 06:00 UTC (matches the old Vercel schedule).
resource "aws_cloudwatch_event_rule" "sync" {
  name                = "${local.name}-sync"
  schedule_expression = "cron(0 6 * * ? *)"
}

resource "aws_cloudwatch_event_target" "sync" {
  rule     = aws_cloudwatch_event_rule.sync.name
  arn      = aws_cloudwatch_event_api_destination.sync.arn
  role_arn = aws_iam_role.cron.arn
}

# Retention purge — daily 04:00 UTC.
resource "aws_cloudwatch_event_rule" "purge" {
  name                = "${local.name}-purge"
  schedule_expression = "cron(0 4 * * ? *)"
}

resource "aws_cloudwatch_event_target" "purge" {
  rule     = aws_cloudwatch_event_rule.purge.name
  arn      = aws_cloudwatch_event_api_destination.purge.arn
  role_arn = aws_iam_role.cron.arn
}
