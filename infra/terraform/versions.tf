# ---------------------------------------------------------------------------
# Provider/version pins.
#
# WHY OpenTofu, and why this file runs identically under plain `terraform`:
#   - The HCL below is Terraform-compatible HCL; the only tooling difference is which
#     binary interprets it. `terraform` is already installed on the maintainer's
#     machine, so this skeleton is runnable today with no new tool.
#   - OpenTofu is the preferred binary going forward: MPL-2.0, community-maintained,
#     and no BUSL-license surprise for a production product. Nothing in this file
#     depends on it, so the choice is reversible.
#   The OpenTofu-vs-Terraform decision is recorded for Musti's architecture review in
#   sub-ticket 06.1 (DoD: ADR at architecture decisions), not silently baked in here.
# ---------------------------------------------------------------------------

terraform {
  # >= 1.8 keeps both OpenTofu and Terraform happy; bump deliberately, not implicitly.
  required_version = ">= 1.8.0"

  required_providers {
    hcloud = {
      source = "hetznercloud/hcloud"
      # ~> 1.4x is the current stable line at time of writing. Verify against the
      # registry on first `tofu init` (sub-ticket 06.1), then pin exactly for
      # reproducibility — a skeleton should not pretend to a precision it hasn't run.
      version = "~> 1.48"
    }
  }
}
