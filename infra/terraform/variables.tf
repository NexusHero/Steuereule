# ---------------------------------------------------------------------------
# Every value that differs between "skeleton" and "real deployment" is a variable.
# Real values live in terraform.tfvars (git-ignored) or in CI secrets — never here,
# and never committed (infra/.gitignore ignores *.tfvars but not *.tfvars.example).
# ---------------------------------------------------------------------------

variable "hcloud_token" {
  type        = string
  sensitive   = true
  description = "Hetzner Cloud API token — credential checklist item 1."
}

variable "location" {
  type        = string
  default     = "fsn1" # Falkenstein (DE)
  description = "Hetzner location. fsn1/nbg1 (DE) or hel1 (FI) — MUST be EU, ADR-020 data residency."
}

variable "server_type" {
  type        = string
  default     = "cpx31"
  description = "k3s node size. Small shared-CPU for slice-1/staging; revisit for prod (Pre-Go-Live-Lasttest)."
}

variable "node_count" {
  type        = number
  default     = 1
  description = "k3s server nodes. 1 is fine for staging; 3 for prod HA (later, explicit decision)."
}

variable "domain" {
  type        = string
  description = "Public domain (credential checklist item 2) — e.g. steuereule.example. Drives ingress/TLS and API/WEB origins."
}

variable "ssh_public_keys" {
  type        = list(string)
  description = "SSH public keys installed on nodes for operator access (never a password)."
}

variable "private_network_range" {
  type        = string
  default     = "10.0.0.0/16"
  description = "Private cluster network CIDR — pod/node traffic stays off the public interface."
}
