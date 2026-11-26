#!/usr/bin/env bash
# Resolve the image names and the public origins of the deploy.

set -e

registry="$REGION-docker.pkg.dev/$PROJECT_ID/steuereule"
tag="$(git rev-parse --short=12 HEAD)"
{
  echo "APP_VERSION=$tag"
  echo "API_IMAGE=$registry/api:$tag"
  echo "WEB_IMAGE=$registry/web:$tag"
  echo "WEBSITE_IMAGE=$registry/website:$tag"
  echo "API_ORIGIN=https://api.$APP_DOMAIN"
  echo "WEB_ORIGIN=https://www.$APP_DOMAIN"
} >> "$GITHUB_ENV"
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
