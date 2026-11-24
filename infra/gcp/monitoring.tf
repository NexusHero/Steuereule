# Alerting with Google Cloud Monitoring only: no third-party tool. Every resource below is skipped
# while alert_email is empty. What each alert means and what to check first:
# docs/sre/incident-runbook.md.
locals {
  alerts_enabled = var.alert_email != ""
  api_service    = "steuereule-api" # created by .github/workflows/deploy.yml, not by this stack
  run_filter     = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.api_service}\""
  alert_channels = local.alerts_enabled ? [google_monitoring_notification_channel.email[0].id] : []
}

resource "google_monitoring_notification_channel" "email" {
  count        = local.alerts_enabled ? 1 : 0
  display_name = "Steuereule ${var.environment} alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.enabled]
}

# ── Availability ────────────────────────────────────────────────────────────────────────────
resource "google_monitoring_uptime_check_config" "api_live" {
  count        = local.alerts_enabled && var.api_hostname != "" ? 1 : 0
  display_name = "API liveness (${var.environment})"
  period       = "60s"
  timeout      = "10s"

  http_check {
    path           = "/v1/health/live"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.api_hostname
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "api_down" {
  count        = length(google_monitoring_uptime_check_config.api_live)
  display_name = "API down: /v1/health/live fails (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check fails from every location"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.api_live[0].uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "180s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
    }
  }

  notification_channels = local.alert_channels
  documentation {
    mime_type = "text/markdown"
    content   = "The API does not answer /v1/health/live. First steps: docs/sre/incident-runbook.md, section API down."
  }
}

# ── Errors ──────────────────────────────────────────────────────────────────────────────────
resource "google_monitoring_alert_policy" "api_5xx" {
  count        = local.alerts_enabled ? 1 : 0
  display_name = "API: more than 5 percent 5xx responses (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "5xx share of requests over 5 minutes"
    condition_threshold {
      filter             = "metric.type=\"run.googleapis.com/request_count\" AND ${local.run_filter} AND metric.labels.response_code_class=\"5xx\""
      denominator_filter = "metric.type=\"run.googleapis.com/request_count\" AND ${local.run_filter}"
      comparison         = "COMPARISON_GT"
      threshold_value    = 0.05
      duration           = "300s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
      denominator_aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = local.alert_channels
  documentation {
    mime_type = "text/markdown"
    content   = "More than 5 percent of API requests end in 5xx. First steps: docs/sre/incident-runbook.md, section 5xx ratio."
  }
}

# Cloud Run writes these system log lines when an instance is killed or exits.
resource "google_logging_metric" "api_container_crash" {
  count  = local.alerts_enabled ? 1 : 0
  name   = "api_container_crash"
  filter = "${local.run_filter} AND (textPayload:\"Memory limit of\" OR textPayload:\"Container terminated on signal\" OR textPayload:\"Container called exit\")"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }

  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "api_container_crash" {
  count        = local.alerts_enabled ? 1 : 0
  display_name = "API: container crashed or ran out of memory (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Container killed or exited"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.api_container_crash[0].name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = local.alert_channels
  alert_strategy {
    auto_close = "3600s"
  }
  documentation {
    mime_type = "text/markdown"
    content   = "A Cloud Run instance of the API was killed (often the 2 GiB memory limit during a PDF render) or exited. First steps: docs/sre/incident-runbook.md, section Container crash."
  }
}

# The API logs unhandled request errors through the Nest logger (class ExceptionsHandler, or
# "Unhandled error in better-auth request handler") to stderr, which Cloud Run records as ERROR.
# The filter matches both the plain-text form (textPayload) and the structured form (jsonPayload.message)
# that Cloud Error Reporting groups, so the switch to structured logging does not blind this alert.
resource "google_logging_metric" "api_unhandled_error" {
  count  = local.alerts_enabled ? 1 : 0
  name   = "api_unhandled_error"
  filter = "${local.run_filter} AND severity>=ERROR AND (textPayload:\"ExceptionsHandler\" OR textPayload:\"Unhandled error\" OR jsonPayload.message:\"ExceptionsHandler\" OR jsonPayload.message:\"Unhandled error\")"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }

  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "api_unhandled_error" {
  count        = local.alerts_enabled ? 1 : 0
  display_name = "API: unhandled errors (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Three or more unhandled errors in 5 minutes"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.api_unhandled_error[0].name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 2
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = local.alert_channels
  alert_strategy {
    auto_close = "3600s"
  }
  documentation {
    mime_type = "text/markdown"
    content   = "The API logged unhandled errors. First steps: docs/sre/incident-runbook.md, section Unhandled errors."
  }
}

# ── Database ────────────────────────────────────────────────────────────────────────────────
resource "google_monitoring_alert_policy" "sql_disk" {
  count        = local.alerts_enabled ? 1 : 0
  display_name = "Cloud SQL: disk above 80 percent (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Disk utilisation"
    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/disk/utilization\" AND resource.type=\"cloudsql_database\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "300s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = local.alert_channels
  documentation {
    mime_type = "text/markdown"
    content   = "A Cloud SQL disk is above 80 percent. The tax-data instance autoresizes, the keystore instance does not. First steps: docs/sre/incident-runbook.md, section Cloud SQL."
  }
}

resource "google_monitoring_alert_policy" "sql_cpu" {
  count        = local.alerts_enabled ? 1 : 0
  display_name = "Cloud SQL: CPU above 80 percent (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "CPU utilisation over 15 minutes"
    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" AND resource.type=\"cloudsql_database\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "900s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = local.alert_channels
  documentation {
    mime_type = "text/markdown"
    content   = "A Cloud SQL instance has run above 80 percent CPU for 15 minutes. First steps: docs/sre/incident-runbook.md, section Cloud SQL."
  }
}
