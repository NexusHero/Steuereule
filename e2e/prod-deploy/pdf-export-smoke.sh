#!/usr/bin/env bash
# REQ-011 PDF export — real HTTP against the built apps/api/Dockerfile container (CI job `e2e: production stack smoke`).
# The coordinator's own F5 follow-up: F1 (Musti's #274 review) added Chromium to
# apps/api/Dockerfile, but nothing had actually exercised it INSIDE the built container —
# e2e/prod-deploy/run.mjs only covers guest/registration/login/QR, and the `smoke`/
# `integration` (quality.yml) jobs' own REQ-011 checks run against the API booted directly on the
# runner via the tsx bridge, never through this Dockerfile. Chromium installing without
# error is not the same claim as Chromium launching and rendering inside THIS image's
# exact base layers/permissions — closing that gap here, the same way `smoke`'s own
# REQ-011 step already proves it for the non-containerised boot path.
#
# API_ORIGIN is hardcoded `:3000` here for the same reason the step above hardcodes it
# (this job's own header comment, Musti's #274 review F3) — but stated again HERE rather
# than inherited by proximity: the step above carries that isolation in its own `env:`
# block, this one does not, so a reader arriving at this step alone has nothing to read it
# off. Same fixed port, same deliberate independence from whatever `.env` says.
#
# ADR-0021 control proof (Musti's #274 review, F7): structurally this cannot go vacuously
# green — `account.module.ts` binds PDF_RENDERER unconditionally to PlaywrightPdfRenderer
# and `renderPdf()` has no non-Chromium path, so `%PDF-` bytes can only come out of
# `page.pdf()`. But that is the source-code reading of the proof, and this PR's own
# OpenSSL section is the argument for why that is not enough. Proven by commit A/B
# instead: apps/api/Dockerfile's `playwright-core install chromium` line removed, this
# step watched fall with its OWN error text below, then restored and watched go green —
# which also proves F1's fix is load-bearing rather than incidentally present. See PR
# #274's body for the transcript.

set -e
JAR=$(mktemp)
curl --fail --silent --show-error -c "$JAR" -b "$JAR" \
  -H "Content-Type: application/json" -H "Origin: http://localhost:8080" \
  -X POST http://localhost:3000/api/auth/sign-up/email \
  -d '{"email":"prod-deploy-pdf-smoke@example.com","password":"a-fine-strong-password-1","name":"Prod Deploy PDF Smoke"}' \
  > /dev/null
# Sign-up returns no session (ADR-0109): verify the address as the mail's link would, then sign in.
PGPASSWORD="$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)" psql -h localhost -U "$(sed -n 's/^POSTGRES_USER=//p' .env)" -d "$(sed -n 's/^POSTGRES_DB=//p' .env)" -c "$(PRISMA_FIELD_ENCRYPTION_HASH_SALT="$(sed -n 's/^PRISMA_FIELD_ENCRYPTION_HASH_SALT=//p' .env)" node e2e/harness/email-hash.mjs prod-deploy-pdf-smoke@example.com)"
curl --fail --silent --show-error -c "$JAR" -b "$JAR" \
  -H "Content-Type: application/json" -H "Origin: http://localhost:8080" \
  -X POST http://localhost:3000/api/auth/sign-in/email \
  -d '{"email":"prod-deploy-pdf-smoke@example.com","password":"a-fine-strong-password-1"}' \
  > /dev/null
curl --fail --silent --show-error -c "$JAR" -b "$JAR" \
  -H "Content-Type: application/json" -H "Origin: http://localhost:8080" \
  -X PUT http://localhost:3000/v1/profile \
  -d '{"firstName":"Prod","lastName":"Deploy","steuerId":"02476291358","steuernummer":"18181508155"}' \
  > /dev/null
# NO --fail on THIS request, deliberately (found by this gate's own ADR-0021 control
# proof, run 31001786620): with --fail, the single most likely real failure — Chromium
# missing/unable to render, so the export 500s — aborted the step at curl under `set -e`
# with a bare "curl: (22) ... error: 500" / "Process completed with exit code 22", and
# NONE of the assertions below ever ran. The gate was red for the right reason and
# said none of it: an operator got an exit code, not the named cause, and the careful
# error text under it was unreachable in exactly the case it was written for. Take the
# status explicitly instead and let this step do its own diagnosis.
http_status=$(curl --silent --show-error -b "$JAR" -o /tmp/prod-deploy-pdf-smoke.pdf \
  -D /tmp/prod-deploy-pdf-headers.txt -w '%{http_code}' \
  "http://localhost:3000/v1/account/export?format=pdf")
if [ "$http_status" != "200" ]; then
  echo "::error::GET /v1/account/export?format=pdf (real container) returned HTTP $http_status, expected 200 — the export never produced a document. Chromium failing to launch or render inside this image is the first thing to check (see the api container's own PlaywrightPdfRenderer log line, printed by the Container logs step below)."
  echo "First 400 bytes of the body actually returned:"
  head -c 400 /tmp/prod-deploy-pdf-smoke.pdf | cat -v
  echo
  exit 1
fi
pdf_headers=$(cat /tmp/prod-deploy-pdf-headers.txt)
echo "$pdf_headers" | grep -qi '^content-type: application/pdf' || {
  echo "::error::GET /v1/account/export?format=pdf (real container) did not return application/pdf. Headers were:"
  echo "$pdf_headers"
  exit 1
}
# The first bytes are echoed into the failure message on purpose: this assertion goes
# red for the right reason but tells the next reader nothing about WHAT came back
# instead — an HTML error page and an empty body look identical in a bare "did not
# start with %PDF-". Print the head so the log names the actual body, not just its
# absence.
head -c 5 /tmp/prod-deploy-pdf-smoke.pdf | grep -q '%PDF-' || {
  echo "::error::PDF export body (real container) did not start with the %PDF- magic bytes — Chromium never rendered inside this image."
  echo "First 200 bytes of the body actually returned:"
  head -c 200 /tmp/prod-deploy-pdf-smoke.pdf | cat -v
  echo
  echo "Body size: $(wc -c < /tmp/prod-deploy-pdf-smoke.pdf) bytes"
  exit 1
}
