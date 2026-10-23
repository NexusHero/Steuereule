# ---------------------------------------------------------------------------
# Remote state. WHY it matters here specifically: the Terraform state of a cluster
# contains real IPs and, in a naive setup, could end up holding the kubeconfig — so it
# must never sit in a developer's checkout or, worse, get committed. Hetzner Object
# Storage (S3-compatible) is the zero-extra-service choice: Hetzner already hosts
# everything else in this track.
#
# This is sub-ticket 06.1's "remote state active" acceptance criterion. Until 06.1
# lands and the real bucket/keys exist (credential checklist), leave this file's block
# commented and run `tofu plan` with a local backend — the skeleton stays runnable
# without any credentials, which is the whole point of Slice 1.
# ---------------------------------------------------------------------------

# terraform {
#   backend "s3" {
#     bucket   = "steuereule-tfstate"            # TODO(06.1): real bucket name
#     key      = "infra/k3s/terraform.tfstate"
#     region   = "fsn1"                          # Hetzner Object Storage region (EU)
#     endpoints = { s3 = "https://fsn1.your-objectstorage.example" }
#     # Hetzner's S3 is not AWS: disable the AWS-specific validations the S3 backend
#     # would otherwise perform, and authenticate via its own access/secret keys
#     # (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from the credential checklist).
#     skip_credentials_validation = true
#     skip_region_validation      = true
#     skip_requesting_account_id  = true
#   }
# }
