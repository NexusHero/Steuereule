#!/usr/bin/env bash
# Configuration gate: every value the deploy needs is present before anything is built or pushed.

set -e

if [ -n "$REPOSITORY_LEVEL" ]; then
  echo "::error::Deploy variables set at repository level: $REPOSITORY_LEVEL — move them into the GitHub environment '$TARGET_ENV' (Settings -> Environments). At repository level they silently fill in for any environment that lacks them."
  exit 1
fi
if [ "$GITHUB_REF" != "refs/heads/main" ]; then
  echo "::error::Deploys run only from main (this run is on $GITHUB_REF); the GCP side refuses other refs too."
  exit 1
fi
missing=""
for name in $REQUIRED_VARIABLES; do
  jq -e --arg name "$name" '(.[$name] // "") != ""' <<<"$ENVIRONMENT_VARS" >/dev/null || missing="$missing $name"
done
if [ -n "$missing" ]; then
  echo "::error::Variables missing in the GitHub environment '$TARGET_ENV':$missing — run scripts/infra/gcp-setup.sh (infra/README.md)."
  exit 1
fi
marker="$(jq -r '.GCP_ENVIRONMENT' <<<"$ENVIRONMENT_VARS")"
if [ "$marker" != "$TARGET_ENV" ]; then
  echo "::error::GCP_ENVIRONMENT is '$marker' in the GitHub environment '$TARGET_ENV' — refusing to deploy values meant for another environment."
  exit 1
fi
