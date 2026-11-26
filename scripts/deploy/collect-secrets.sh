#!/usr/bin/env bash
# Collect the secrets that have a value, as the --set-secrets list of the Cloud Run deploy.

set -e

secrets=""
for name in $REQUIRED_SECRETS $OPTIONAL_SECRETS; do
  if [ -n "$(gcloud secrets versions list "$name" --filter=state=enabled --limit=1 --format='value(name)')" ]; then
    secrets="$secrets,$name=$name:latest"
  fi
done
missing=""
for required in $REQUIRED_SECRETS; do
  case "$secrets," in
    *",$required="*) ;;
    *) missing="$missing $required" ;;
  esac
done
for required in $MIGRATE_ONLY_SECRETS; do
  if [ -z "$(gcloud secrets versions list "$required" --filter=state=enabled --limit=1 --format='value(name)')" ]; then
    missing="$missing $required"
  fi
done
if [ -n "$missing" ]; then
  echo "::error::Secrets without an enabled version:$missing — run scripts/infra/gcp-setup.sh (infra/README.md). The API refuses to start without them."
  exit 1
fi
echo "API_SECRETS=${secrets#,}" >> "$GITHUB_ENV"
# The migrate job reads encrypted columns too (the backfills, `rotate:field-key`): during a key
# rotation it needs the retired keys the API reads with, or it would treat their ciphertext as text.
# In the job DATABASE_URL is the migration login (the owner of the tables); the API's own login reaches it
# as RUNTIME_DATABASE_URL, and the job creates that login (scripts/runtime-database-login.mjs, P11).
migrate="DATABASE_URL=MIGRATE_DATABASE_URL:latest,RUNTIME_DATABASE_URL=DATABASE_URL:latest,KEYSTORE_DATABASE_URL=KEYSTORE_DATABASE_URL:latest,PRISMA_FIELD_ENCRYPTION_KEY=PRISMA_FIELD_ENCRYPTION_KEY:latest,PRISMA_FIELD_ENCRYPTION_HASH_SALT=PRISMA_FIELD_ENCRYPTION_HASH_SALT:latest"
case "$secrets," in
  *",PRISMA_FIELD_DECRYPTION_KEYS="*) migrate="$migrate,PRISMA_FIELD_DECRYPTION_KEYS=PRISMA_FIELD_DECRYPTION_KEYS:latest" ;;
esac
echo "MIGRATE_SECRETS=$migrate" >> "$GITHUB_ENV"
