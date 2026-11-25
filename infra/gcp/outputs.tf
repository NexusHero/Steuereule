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

output "migrate_service_account" {
  description = "GitHub repo variable GCP_MIGRATE_SA: the migrate job's account, the only one that reads MIGRATE_DATABASE_URL."
  value       = google_service_account.migrate.email
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

output "redis_tls_ca_secret" {
  description = "Secret Manager secret that holds the Redis server CA (env REDIS_TLS_CA of the API); empty while enable_redis is false."
  value       = var.enable_redis ? google_secret_manager_secret.app["REDIS_TLS_CA"].secret_id : ""
}

output "vpc_network" {
  description = "GitHub variable GCP_VPC_NETWORK: the network Cloud Run joins to reach Cloud SQL and Redis."
  value       = data.google_compute_network.vpc.name
}

output "vpc_subnet" {
  description = "GitHub variable GCP_VPC_SUBNET: the subnet for Direct VPC egress."
  value       = var.vpc_subnet
}
