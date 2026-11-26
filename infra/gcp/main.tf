locals {
  # One GCP project per environment (staging, production; "beta" is the first stack, which keeps
  # its resource names and now serves as staging). Names that live inside a project carry the
  # environment only where a human reads them (Cloud SQL, budget); everything else is already
  # scoped by the project.
  # The OIDC token of a GitHub job bound to an environment carries `environment`: the deployer of
  # a project can only be impersonated from the GitHub environments listed for it.
  production = var.environment == "production"

  # Cloud SQL tier: shared core for beta and staging, a dedicated core for production (shared-core
  # tiers are not covered by the Cloud SQL SLA and cannot run high availability).
  db_tier = coalesce(var.db_tier, local.production ? "db-custom-1-3840" : "db-f1-micro")
  # Zonal unless asked for: high availability needs PITR (already on for both instances) and a
  # dedicated-core tier. It doubles the instance price.
  db_regional       = coalesce(var.db_high_availability, local.production)
  db_availability   = local.db_regional ? "REGIONAL" : "ZONAL"
  db_shared_core    = can(regex("^db-(f1|g1)-", local.db_tier))
  db_regional_valid = !(local.db_regional && local.db_shared_core)

  # max_connections of both instances. The Cloud Run service runs up to 10 instances (deploy.yml
  # --max-instances); each holds a pool of connection_limit connections per database (scripts/infra/
  # gcp-setup.sh writes 5 into DATABASE_URL and 2 into KEYSTORE_DATABASE_URL; the adaptive default of
  # apps/api/src/config/runtime-capacity.ts is 3 for one vCPU and applies only when the URL has no
  # connection_limit).
  #   tax data:  10 instances x 5 = 50, + 5 for the migrate job (same URL, same pool) = 55,
  #              + 3 reserved superuser slots + 2 for an operator session = 60.
  #   keystore:  10 x 2 = 20, + 2 migrate, + the same 5 of headroom = 27, well inside 60.
  # 60 is therefore the floor; 100 on the dedicated-core tier leaves room to raise max-instances.
  # On db-f1-micro (0.6 GB) the default is 25, so the flag is raised to 60: untested there, and each
  # backend costs memory. If the instance shows memory pressure, lower --max-instances in deploy.yml
  # (5 instances need 25 + 5 + 5 = 35) instead of lowering this flag below the arithmetic.
  db_max_connections = local.db_shared_core ? "60" : "100"

  github_environment_condition = join(" || ", [for env in var.github_environments : "assertion.environment == \"${env}\""])

  # Which git refs may deploy (ADR-0113): staging the tip of main, production only a release tag v*. The condition is
  # evaluated by Google on the token GitHub signed, so it holds even if a workflow file is changed.
  github_ref_condition = var.environment == "production" ? "assertion.ref.startsWith(\"refs/tags/v\")" : "assertion.ref == \"refs/heads/main\""

  services = [
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "compute.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ]

  # Mirrors apps/api/src/config/production-config.ts (the API refuses to start on a deployment without
  # these) and REQUIRED_SECRETS / OPTIONAL_SECRETS in .github/workflows/deploy.yml;
  # apps/api/test/config/deployment-wiring.test.ts keeps the three in step.
  required_secrets = [
    "DATABASE_URL",
    "GUEST_SESSION_SECRET",
    "PRISMA_FIELD_ENCRYPTION_KEY",
    "PRISMA_FIELD_ENCRYPTION_HASH_SALT",
    "KEYSTORE_DATABASE_URL",
    "KEYSTORE_MASTER_KEY",
    "BETTER_AUTH_SECRET",
    "BREVO_API_KEY",
    # Payment is required on a deployment, so the printout never dead-ends (OPS-6, OPS-10). The price ids are
    # not secret, but Secret Manager is the one store the deploy mounts runtime values from.
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
    "STRIPE_PRICE_ID_SELBSTSTAENDIG",
    # Shared run log and rate limiter. Without it every limit would count per instance (up to ten times
    # the limit), so a deployment refuses to start without it (OPS-7). enable_redis below fills it; with
    # enable_redis = false put the rediss:// URL of another Redis into this secret.
    "REDIS_URL",
  ]

  optional_secrets = [
    # Key rotation: earlier field keys and keystore master keys, still accepted for reading.
    "PRISMA_FIELD_DECRYPTION_KEYS",
    "KEYSTORE_MASTER_KEY_PREVIOUS",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    # Apple sign-in (REQ-008) stays off until APPLE_SIGN_IN_ENABLED is set and both have a value.
    "APPLE_CLIENT_ID",
    "APPLE_CLIENT_SECRET",
    # The owl answers from the built-in rules until one provider key has a value (ADR-0064).
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    # A key for the chosen provider, and one per model slot (chat, documents, fallback, topic guard).
    "AI_API_KEY",
    "AI_ADVISOR_API_KEY",
    "AI_VISION_API_KEY",
    "AI_FALLBACK_API_KEY",
    "AI_GUARD_API_KEY",
    # PIN of the operator's ELSTER certificate; read only while ELSTER_TRANSMISSION_ENABLED is on.
    "ELSTER_CERT_PIN",
    # PEM of the Memorystore server CA; the API verifies the rediss:// connection with it.
    "REDIS_TLS_CA",
  ]

  # Row-level security (P11): the login that owns the tables. Only the migrate job reads it; the API connects
  # with DATABASE_URL, a login the migrate job creates without ownership (apps/api/scripts/runtime-database-login.mjs).
  migrate_only_secrets = [
    "MIGRATE_DATABASE_URL",
  ]

  # What the migrate job mounts (.github/workflows/deploy.yml, MIGRATE_SECRETS): both logins, the keystore, and
  # the field keys its backfills and `rotate:field-key` read and write with.
  migrate_job_secrets = [
    "MIGRATE_DATABASE_URL",
    "DATABASE_URL",
    "KEYSTORE_DATABASE_URL",
    "PRISMA_FIELD_ENCRYPTION_KEY",
    "PRISMA_FIELD_ENCRYPTION_HASH_SALT",
    "PRISMA_FIELD_DECRYPTION_KEYS",
  ]
}

resource "google_project_service" "enabled" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  repository_id = "steuereule"
  location      = var.region
  format        = "DOCKER"

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-five-most-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  # An image that passed a staging deploy is tagged staging-ok-<commit> and is what a release promotes to production
  # (ADR-0113). It stays promotable for 30 days; KEEP wins over the DELETE policy below.
  cleanup_policies {
    id     = "keep-proven-on-staging"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["staging-ok-"]
      newer_than   = "2592000s"
    }
  }

  cleanup_policies {
    id     = "delete-older"
    action = "DELETE"
    condition {
      older_than = "604800s"
    }
  }

  depends_on = [google_project_service.enabled]
}

# ── Network: one VPC for Cloud SQL (private IP) and Memorystore ───────────────────────────────
# The API service and the migrate job join this network with Direct VPC egress (no connector
# instances to pay for), `--vpc-egress private-ranges-only`: only traffic to private addresses
# (Cloud SQL, Redis) uses the VPC, everything else keeps the default egress.
data "google_compute_network" "vpc" {
  name       = var.vpc_network
  depends_on = [google_project_service.enabled]
}

# Address range for private services access (Cloud SQL lives in a Google-managed VPC peered to ours).
# No address is given: GCP picks a free /20 that does not overlap the subnets.
resource "google_compute_global_address" "private_services" {
  name          = "steuereule-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = data.google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = data.google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
  # Deleting the peering fails while Cloud SQL instances still use it; abandon it instead of blocking a destroy.
  deletion_policy = "ABANDON"
}

resource "google_sql_database_instance" "postgres" {
  name                = "steuereule-${var.environment}"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true

  lifecycle {
    precondition {
      condition     = local.db_regional_valid
      error_message = "High availability (REGIONAL) needs a dedicated-core tier; db_tier is a shared-core one."
    }
  }

  settings {
    tier              = local.db_tier
    edition           = "ENTERPRISE"
    availability_type = local.db_availability
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 7
      }
    }

    # Private IP only (private services access on the VPC below). The Cloud Run service and the
    # migrate job reach it through Direct VPC egress and the same Cloud SQL socket as before.
    ip_configuration {
      ipv4_enabled    = var.db_keep_public_ipv4 # false; true only during the migration to private IP (infra/README.md)
      private_network = data.google_compute_network.vpc.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    # Checkpoints and waits on locks in the instance log: what a slow or stuck database was doing (Sonar S6258).
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }
    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }
    # Every connection attempt in the instance log, for the audit trail of tax data (Sonar S6258).
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    # And every connection's end with its duration, so a session can be followed to its close (Sonar S6258).
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
    database_flags {
      name  = "max_connections"
      value = local.db_max_connections
    }

    insights_config {
      query_insights_enabled = false
    }
  }

  depends_on = [google_project_service.enabled, google_service_networking_connection.private_services]
}

resource "google_sql_database" "app" {
  name     = "steuereule"
  instance = google_sql_database_instance.postgres.name
}

# Receipt-file keystore (ADR-0059). A separate instance ON PURPOSE: Cloud SQL backups are
# per instance, and crypto-shredding only reaches the tax-data backups if the keys expire
# from their own backups sooner. Retention here (2 backups, 1 day PITR) is therefore
# deliberately shorter than the tax-data instance above (7 / 7).
resource "google_sql_database_instance" "keystore" {
  name                = "steuereule-${var.environment}-keystore"
  database_version    = "POSTGRES_16"
  region              = var.region
  deletion_protection = true

  lifecycle {
    precondition {
      condition     = local.db_regional_valid
      error_message = "High availability (REGIONAL) needs a dedicated-core tier; db_tier is a shared-core one."
    }
  }

  settings {
    tier              = local.db_tier
    edition           = "ENTERPRISE"
    availability_type = local.db_availability
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = false

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:30"
      transaction_log_retention_days = 1

      backup_retention_settings {
        retained_backups = 2
      }
    }

    # Private IP only (private services access on the VPC below). The Cloud Run service and the
    # migrate job reach it through Direct VPC egress and the same Cloud SQL socket as before.
    ip_configuration {
      ipv4_enabled    = var.db_keep_public_ipv4 # false; true only during the migration to private IP (infra/README.md)
      private_network = data.google_compute_network.vpc.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    # Checkpoints and waits on locks in the instance log: what a slow or stuck database was doing (Sonar S6258).
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }
    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }
    # Every connection attempt in the instance log, for the audit trail of tax data (Sonar S6258).
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    # And every connection's end with its duration, so a session can be followed to its close (Sonar S6258).
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
    database_flags {
      name  = "max_connections"
      value = local.db_max_connections
    }
  }

  depends_on = [google_project_service.enabled, google_service_networking_connection.private_services]
}

resource "google_sql_database" "keystore" {
  name     = "steuereule_keystore"
  instance = google_sql_database_instance.keystore.name
}

resource "google_secret_manager_secret" "app" {
  for_each  = toset(concat(local.required_secrets, local.optional_secrets, local.migrate_only_secrets))
  secret_id = each.value

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_service_account" "api_runtime" {
  account_id   = "steuereule-api"
  display_name = "Steuereule API runtime"
}

resource "google_service_account" "migrate" {
  account_id   = "steuereule-migrate"
  display_name = "Steuereule migrate job (owner of the database schema)"
}

resource "google_service_account" "web_runtime" {
  account_id   = "steuereule-web"
  display_name = "Steuereule web runtime (no roles)"
}

resource "google_service_account" "deployer" {
  account_id   = "steuereule-deployer"
  display_name = "Steuereule GitHub Actions deployer"
}

# The API reads every secret except the migration login: with it the API could act as the owner of the tables.
resource "google_secret_manager_secret_iam_member" "api_reads_secrets" {
  for_each  = { for name, secret in google_secret_manager_secret.app : name => secret if !contains(local.migrate_only_secrets, name) }
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "migrate_reads_secrets" {
  for_each  = toset(local.migrate_job_secrets)
  secret_id = google_secret_manager_secret.app[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrate.email}"
}

resource "google_project_iam_member" "migrate_connects_to_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrate.email}"
}

resource "google_project_iam_member" "api_connects_to_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

# Who else may pull from this registry. In the staging stack: the production deployer, which promotes the API image
# staging ran (ADR-0113). Read access only; pushing stays with the deployer of this project.
resource "google_artifact_registry_repository_iam_member" "image_readers" {
  for_each   = toset(var.image_readers)
  repository = google_artifact_registry_repository.images.id
  role       = "roles/artifactregistry.reader"
  member     = each.value
}

resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/secretmanager.viewer",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# The deploy takes an on-demand backup of the tax-data instance before it migrates (deploy.yml). No predefined
# role is that narrow (roles/cloudsql.editor could also change or restart the instance), so the deployer gets
# exactly these permissions (OPS-11): create a backup, follow the operation it starts, read the result.
resource "google_project_iam_custom_role" "pre_deploy_backup" {
  role_id     = "steuereulePreDeployBackup"
  title       = "Steuereule pre-deploy backup"
  description = "Create and read on-demand Cloud SQL backups before a migration."
  permissions = [
    "cloudsql.backupRuns.create",
    "cloudsql.backupRuns.get",
    "cloudsql.backupRuns.list",
    "cloudsql.instances.get",
  ]
}

resource "google_project_iam_member" "deployer_backs_up_sql" {
  project = var.project_id
  role    = google_project_iam_custom_role.pre_deploy_backup.id
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  for_each = {
    api     = google_service_account.api_runtime.name
    migrate = google_service_account.migrate.name
    web     = google_service_account.web_runtime.name
  }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "steuereule"
  display_name                       = "Steuereule repository"

  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.ref"         = "assertion.ref"
    "attribute.environment" = "assertion.environment"
  }

  attribute_condition = "assertion.repository == \"${var.github_repository}\" && ${local.github_ref_condition} && (${local.github_environment_condition})"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonates_deployer" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

data "google_project" "this" {}

resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account_id
  display_name    = "Steuereule ${var.environment}"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "EUR"
      units         = tostring(var.monthly_budget_eur)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  depends_on = [google_project_service.enabled]
}

# ── Redis for the owl's answer runs and the rate limiter (ADR-0064, ADR-0066 §8) ─────────────
# On by default: a deployment refuses to start without REDIS_URL (OPS-7). The smallest Memorystore
# instance costs roughly 35 EUR a month per environment; with enable_redis = false put the rediss://
# URL of another Redis into the secret REDIS_URL yourself.
#
# AUTH and TLS are on: the instance is reachable from the whole VPC, so a network position alone
# must not be enough to read or write the answer runs.
# KNOWN CONFLICT with ADR-0053 ("no secret in state"): the generated auth_string is a computed
# attribute of the instance and the secret versions below are built from it, so it is stored in
# the OpenTofu state. The state bucket is private, versioned and not public, which is the
# mitigation; removing the conflict needs a Redis whose password is set outside Terraform.
resource "google_project_service" "redis" {
  count              = var.enable_redis ? 1 : 0
  service            = "redis.googleapis.com"
  disable_on_destroy = false
}

resource "google_redis_instance" "runs" {
  count              = var.enable_redis ? 1 : 0
  name               = "steuereule-runs"
  tier               = "BASIC"
  memory_size_gb     = 1
  region             = var.region
  redis_version      = "REDIS_7_2"
  authorized_network = data.google_compute_network.vpc.id
  connect_mode       = "DIRECT_PEERING"

  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"

  depends_on = [google_project_service.redis]
}

# With in-transit encryption the instance listens on its TLS port; `port` reports that one.
resource "google_secret_manager_secret_version" "redis_url" {
  count       = var.enable_redis ? 1 : 0
  secret      = google_secret_manager_secret.app["REDIS_URL"].id
  secret_data = "rediss://:${urlencode(google_redis_instance.runs[0].auth_string)}@${google_redis_instance.runs[0].host}:${google_redis_instance.runs[0].port}"
}

resource "google_secret_manager_secret_version" "redis_tls_ca" {
  count       = var.enable_redis ? 1 : 0
  secret      = google_secret_manager_secret.app["REDIS_TLS_CA"].id
  secret_data = google_redis_instance.runs[0].server_ca_certs[0].cert
}
