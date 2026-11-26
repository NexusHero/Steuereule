#!/usr/bin/env bash
# Deploy the API to Cloud Run.
# ADR-0064: an owl answer keeps running after its HTTP response has ended (stop, resume, a
# reader that left). `--no-cpu-throttling` keeps the CPU allocated for that; with throttling
# the run would freeze the moment the request ends. `--session-affinity` keeps a client on
# the instance that holds its run while there is no shared Redis.
#
# OPS-12: --update-env-vars / --update-secrets MERGE into the service. The values below are owned by this
# workflow and rewritten on every deploy; anything an operator set by hand (AI_KILL_SWITCH, model choice,
# daily limits) survives. Remove a hand-set value with `gcloud run services update --remove-env-vars`.
#
# The list is split on "|" (gcloud's ^|^ syntax): the values hold "," (TRUSTED_PROXIES), ":" and "/" (origins)
# and "@" (EMAIL_FROM), so none of those can separate them. A value that held a "|" would be cut in two and
# set a wrong value without an error, so the step refuses it first.

set -e

for value in "$API_ORIGIN" "$WEB_ORIGIN" "$TRUSTED_PROXIES" "$EMAIL_FROM"; do
  case "$value" in *'|'*) echo "::error::A deploy value contains '|', the separator of --update-env-vars: $value"; exit 1 ;; esac
done
gcloud run deploy steuereule-api \
  --image "$API_IMAGE" --region "$REGION" \
  --service-account "$API_SA" \
  --add-cloudsql-instances "$SQL_INSTANCE,$KEYSTORE_SQL_INSTANCE" \
  --update-secrets "$API_SECRETS" \
  --update-env-vars "^|^NODE_ENV=production|BETTER_AUTH_URL=$API_ORIGIN|CORS_ALLOWED_ORIGINS=$WEB_ORIGIN|WEB_APP_URL=$WEB_ORIGIN|TRUSTED_PROXIES=$TRUSTED_PROXIES|EMAIL_FROM=$EMAIL_FROM" \
  --cpu 1 --memory 2Gi --cpu-boost \
  --no-cpu-throttling --session-affinity \
  --min-instances 0 --max-instances 10 --concurrency 80 --timeout 120 \
  --network "$VPC_NETWORK" --subnet "$VPC_SUBNET" --vpc-egress private-ranges-only \
  --allow-unauthenticated
