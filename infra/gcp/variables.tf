variable "project_id" {
  description = "GCP project that hosts the beta."
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
  default     = 20
}

variable "db_tier" {
  description = "Cloud SQL machine tier."
  type        = string
  default     = "db-f1-micro"
}

variable "enable_redis" {
  description = "Create a Memorystore instance for the owl's answer runs and the rate limiter, and store its URL in the secret REDIS_URL. Costs roughly 35 EUR a month; raise monthly_budget_eur with it."
  type        = bool
  default     = false
}

variable "vpc_network" {
  description = "VPC the Redis instance lives in. The API reaches it through Direct VPC egress: set the repository variables GCP_VPC_NETWORK and GCP_VPC_SUBNET to the same network."
  type        = string
  default     = "default"
}
