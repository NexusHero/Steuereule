#!/usr/bin/env bash
# Post-deploy smoke test: health, auth capabilities, CORS and web against the deployed services.

set -e

api_url="$(gcloud run services describe steuereule-api --region "$REGION" --format='value(status.url)')"
web_url="$(gcloud run services describe steuereule-web --region "$REGION" --format='value(status.url)')"
curl -fsS --retry 5 --retry-delay 5 --retry-all-errors "$api_url/v1/health/ready"
curl -fsS --retry 5 --retry-delay 5 --retry-all-errors "$api_url/v1/auth/capabilities"
cors_headers="$(curl -fsS --retry 5 --retry-delay 5 --retry-all-errors -D - -o /dev/null -H "Origin: $WEB_ORIGIN" "$api_url/v1/auth/capabilities" | tr -d '\r')"
echo "$cors_headers" | grep -qi "^access-control-allow-origin: $WEB_ORIGIN$" || {
  echo "::error::Post-deploy CORS verification failed for Origin $WEB_ORIGIN"
  exit 1
}
web_headers="$(curl -fsS --retry 5 --retry-delay 5 --retry-all-errors -D - -o /dev/null "$web_url/" | tr -d '\r')"
echo "$web_headers" | grep -qi "^content-security-policy: .*frame-src 'self' blob:" || {
  echo "::error::The web app answers without its Content-Security-Policy"
  exit 1
}
site_url="$(gcloud run services describe steuereule-website --region "$REGION" --format='value(status.url)')"
site_headers="$(curl -fsS --retry 5 --retry-delay 5 --retry-all-errors -D - -o /dev/null "$site_url/" | tr -d '\r')"
echo "$site_headers" | grep -qi "^content-security-policy: " || {
  echo "::error::The marketing site answers without its Content-Security-Policy"
  exit 1
}
echo "::notice::Deployed $API_IMAGE ($APP_VERSION) → $API_ORIGIN, $WEB_IMAGE → $WEB_ORIGIN"
