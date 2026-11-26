#!/usr/bin/env bash
# Deploy variables must be environment-scoped: fail if any is set at repository level.

set -e

names=""
for name in $DEPLOY_VARIABLES; do
  if jq -e --arg name "$name" 'has($name)' <<<"$REPOSITORY_VARS" >/dev/null; then
    names="$names $name"
  fi
done
echo "names=${names# }" >> "$GITHUB_OUTPUT"
