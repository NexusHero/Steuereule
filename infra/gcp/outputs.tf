output "workload_identity_provider" {
  description = "GitHub repo variable GCP_WIF_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  description = "GitHub repo variable GCP_DEPLOYER_SA."
  value       = google_service_account.deployer.email
}

output "api_runtime_service_account" {
  description = "GitHub repo variable GCP_RUNTIME_SA."
  value       = google_service_account.api_runtime.email
}

output "web_runtime_service_account" {
  description = "GitHub repo variable GCP_WEB_SA."
  value       = google_service_account.web_runtime.email
}

output "sql_connection_name" {
  description = "GitHub repo variable GCP_SQL_INSTANCE; also the socket path in DATABASE_URL."
  value       = google_sql_database_instance.postgres.connection_name
}

output "image_registry" {
  description = "Registry prefix for the API and web images."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "keystore_sql_connection_name" {
  value       = google_sql_database_instance.keystore.connection_name
  description = "GitHub repo variable GCP_KEYSTORE_SQL_INSTANCE; also the socket path in KEYSTORE_DATABASE_URL (ADR-0059)."
}

output "redis_host" {
  description = "Private address of the Redis instance; empty while enable_redis is false."
  value       = var.enable_redis ? google_redis_instance.runs[0].host : ""
}
