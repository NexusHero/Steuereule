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
  description = "Cloud SQL machine tier. Unset: db-f1-micro (shared core, no SLA) for beta and staging, db-custom-1-3840 (1 dedicated vCPU, 3.75 GB) for production."
  type        = string
  default     = null
}

variable "db_high_availability" {
  description = "Run both Cloud SQL instances regional (standby in a second zone, automatic failover). Unset: on for production only. Doubles the instance price; needs a dedicated-core tier."
  type        = bool
  default     = null
}

variable "db_keep_public_ipv4" {
  description = "Transition only: keep the public IPv4 of the Cloud SQL instances next to the private one while moving an existing stack (infra/README.md). Leave false; a new stack never needs it."
  type        = bool
  default     = false
}

variable "enable_redis" {
  description = "Create a Memorystore instance (AUTH + TLS) for the owl's answer runs and the rate limiter, and store its URL and CA in the secrets REDIS_URL and REDIS_TLS_CA. Costs roughly 35 EUR a month per environment."
  type        = bool
  default     = true
}

variable "vpc_network" {
  description = "VPC of the stack: Cloud SQL (private services access) and Redis live in it. The API service and the migrate job reach both through Direct VPC egress (GitHub variables GCP_VPC_NETWORK and GCP_VPC_SUBNET, set from the outputs). The network must already exist."
  type        = string
  default     = "default"
}

variable "vpc_subnet" {
  description = "Subnet of vpc_network in var.region that Direct VPC egress uses (it consumes one address per Cloud Run instance). Only passed on through the output vpc_subnet."
  type        = string
  default     = "default"
}
