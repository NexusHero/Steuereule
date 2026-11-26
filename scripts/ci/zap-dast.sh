#!/usr/bin/env bash
# OWASP ZAP Baseline & OpenAPI DAST pentest against the production containers (CI job `e2e: OWASP ZAP DAST`).
# ZAP writes its config and report into /zap/wrk as its own user, which is not the runner's:
# a fresh, world-writable folder outside the checkout instead of the repo itself
# (zaproxy:stable of 2026-11-17 failed with „Permission denied: /zap/wrk/zap.yaml“).

ZAP_WRK="$RUNNER_TEMP/zap-wrk"
mkdir -p "$ZAP_WRK"
cp apps/api/openapi.json "$ZAP_WRK/openapi.json"
chmod -R a+rwX "$ZAP_WRK"
docker run --rm --network host \
  -v "$ZAP_WRK:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://localhost:8080 -I -m 1
docker run --rm --network host \
  -v "$ZAP_WRK:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py -t /zap/wrk/openapi.json -f openapi -O http://localhost:3000 -I
