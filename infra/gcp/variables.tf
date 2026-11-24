variable "environment" {
  description = "Which environment this stack is: staging or production. \"beta\" is the first stack, kept under its original resource names; it serves as staging. Use a separate GCP project and a separate state prefix per environment (infra/README.md)."
  type        = string
  validation {
    condition     = contains(["beta", "staging", "production"], var.environment)
    error_message = "environment must be beta, staging or production."
  }
}

variable "github_environments" {
  description = "GitHub environments whose jobs may deploy into this project (checked against the OIDC claim). Staging: [\"staging\"]; production: [\"production\"]. Add \"beta\" while the old workflow may still run."
  type        = list(string)
  default     = ["staging"]
}

variable "alert_email" {
  description = "Address that receives the monitoring alerts. Empty: no alerting resources are created."
  type        = string
  default     = ""
}

variable "api_hostname" {
  description = "Public hostname of the API (for example api.example.org) for the uptime check. Empty: no uptime check."
  type        = string
  default     = ""
}

variable "project_id" {
  description = "GCP project that hosts this environment."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Cloud SQL and Artifact Registry (ADR-0053: domain mappings need europe-west4)."
  type        = string
  default     = "europe-west4"
}

variable "github_repository" {
  description = "The only repository allowed to deploy, as owner/name."
  type        = string
  default     = "NexusHero/Steuereule"
}

variable "billing_account_id" {
  description = "Billing account the budget alert is attached to."
  type        = string
}

variable "monthly_budget_eur" {
  description = "Monthly budget; alerts fire at 50, 90 and 100 percent."
  type        = number
  default     = 60
}

variable "db_tier" {
  description = "Cloud SQL machine tier."
  type        = string
  default     = "db-f1-micro"
}

variable "enable_redis" {
  description = "Create a Memorystore instance (AUTH + TLS) for the owl's answer runs and the rate limiter, and store its URL and CA in the secrets REDIS_URL and REDIS_TLS_CA. Costs roughly 35 EUR a month per environment."
  type        = bool
  default     = true
}

variable "vpc_network" {
  description = "VPC the Redis instance lives in. The API reaches it through Direct VPC egress: set the repository variables GCP_VPC_NETWORK and GCP_VPC_SUBNET to the same network."
  type        = string
  default     = "default"
}
