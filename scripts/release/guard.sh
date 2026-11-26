#!/usr/bin/env bash
# Release guard (ADR-0113): collects the facts about the tag that triggered the run and lets
# scripts/release/guard.mjs decide. Needs a full-history checkout, GH_TOKEN and the GITHUB_* variables.
# Nothing from the release (its name, body or tag text) is interpolated into this script; the ref arrives as an
# environment variable and is only passed on.

set -euo pipefail

: "${GITHUB_REF:?}" "${GITHUB_SHA:?}" "${GITHUB_REPOSITORY:?}" "${GH_TOKEN:?}"

on_main=false
if git rev-parse --verify --quiet origin/main >/dev/null && git merge-base --is-ancestor "$GITHUB_SHA" origin/main; then
  on_main=true
fi

# Runs of this exact commit that finished successfully; guard.mjs picks the push run of "Build & E2E" out of them.
RUNS_JSON="$(gh api -X GET "repos/$GITHUB_REPOSITORY/actions/runs" -f head_sha="$GITHUB_SHA" -f event=push -f status=success -f per_page=100)"
export RUNS_JSON ON_MAIN="$on_main"

node "$(dirname "$0")/guard.mjs"
