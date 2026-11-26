#!/usr/bin/env bash
# Run the database migrations as a Cloud Run job.
# The migrate job belongs to this workflow entirely, so its secrets are set, not merged.

set -e

gcloud run jobs deploy steuereule-migrate \
  --image "$API_IMAGE" --region "$REGION" \
  --service-account "$MIGRATE_SA" \
  --set-cloudsql-instances "$SQL_INSTANCE,$KEYSTORE_SQL_INSTANCE" \
  --network "$VPC_NETWORK" --subnet "$VPC_SUBNET" --vpc-egress private-ranges-only \
  --set-secrets "$MIGRATE_SECRETS" \
  --command sh --args="-c,cd /repo/apps/api && node scripts/migrate-deploy.mjs" \
  --max-retries 0 --task-timeout 600s \
  --execute-now --wait
