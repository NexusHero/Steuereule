#!/usr/bin/env bash
# After the smoke test of a staging deploy has passed, tag the API image that ran there as proven:
# api:staging-ok-<commit>. That tag is the only thing a production deploy promotes (provide-api-image.sh, ADR-0113).

set -e

if [[ "$TARGET_ENV" != staging ]]; then
  echo "::error::Only a staging deploy marks an image as proven (this is '$TARGET_ENV')."
  exit 1
fi
proven="${API_IMAGE%%@*}:staging-ok-$APP_VERSION"
gcloud artifacts docker tags add "$API_IMAGE" "$proven" --quiet
echo "::notice::Marked $proven for promotion to production."
