#!/usr/bin/env bash
# REQ-011 DSGVO export, both formats, over real HTTP against the API booted on the runner (CI job `smoke`).
# Signs a real account up (cookie jar carries the resulting session), saves a
# Profile, then exercises both `?format=` branches of GET /v1/account/export
# against the compiled, listening server — proves the real PlaywrightPdfRenderer
# actually launches Chromium and returns real PDF bytes in this runtime shape,
# not just under `.inject()` (ADR-0013 §7's honest infra note: this is exactly
# the Chromium-in-the-runtime-image question, exercised here in CI's own image).

set -e
JAR=$(mktemp)
curl --fail --silent --show-error -c "$JAR" -b "$JAR" \
  -H "Content-Type: application/json" -H "Origin: ${CORS_ALLOWED_ORIGINS}" \
  -X POST http://localhost:3000/api/auth/sign-up/email \
  -d '{"email":"ci-smoke-export@example.com","password":"a-fine-strong-password-1","name":"CI Smoke Export"}' \
  > /dev/null
# Sign-up returns no session (ADR-0109): verify the address as the mail's link would, then sign in.
psql "$DATABASE_URL" -c "$(node e2e/harness/email-hash.mjs ci-smoke-export@example.com)"
curl --fail --silent --show-error -c "$JAR" -b "$JAR" \
  -H "Content-Type: application/json" -H "Origin: ${CORS_ALLOWED_ORIGINS}" \
  -X POST http://localhost:3000/api/auth/sign-in/email \
  -d '{"email":"ci-smoke-export@example.com","password":"a-fine-strong-password-1"}' \
  > /dev/null
curl --fail --silent --show-error -c "$JAR" -b "$JAR" \
  -H "Content-Type: application/json" -H "Origin: ${CORS_ALLOWED_ORIGINS}" \
  -X PUT http://localhost:3000/v1/profile \
  -d '{"firstName":"CI","lastName":"Smoke","steuerId":"02476291358","steuernummer":"18181508155"}' \
  > /dev/null

json_headers=$(curl --fail --silent --show-error -b "$JAR" -D - -o /tmp/steuereule-export-smoke.json \
  "http://localhost:3000/v1/account/export?format=json")
echo "$json_headers" | grep -qi '^content-type: application/json' || {
  echo "::error::GET /v1/account/export?format=json did not return application/json."
  exit 1
}
grep -q '"schemaVersion":"1.0"' /tmp/steuereule-export-smoke.json || {
  echo "::error::JSON export body missing the expected schemaVersion — got: $(cat /tmp/steuereule-export-smoke.json)"
  exit 1
}

pdf_headers=$(curl --fail --silent --show-error -b "$JAR" -D - -o /tmp/steuereule-export-smoke.pdf \
  "http://localhost:3000/v1/account/export?format=pdf")
echo "$pdf_headers" | grep -qi '^content-type: application/pdf' || {
  echo "::error::GET /v1/account/export?format=pdf did not return application/pdf."
  exit 1
}
head -c 5 /tmp/steuereule-export-smoke.pdf | grep -q '%PDF-' || {
  echo "::error::PDF export body did not start with the %PDF- magic bytes — real Chromium render never happened."
  exit 1
}
