#!/usr/bin/env bash
# Provide the API image of the deploy and pin it by digest (ADR-0113).
#   staging     build the image from the checked-out commit and push it.
#   production  build nothing: copy the image that staging ran for this commit, byte for byte, into the production
#               registry and check that the digest is the same on both sides. What production runs is what was
#               tested on staging, not a second build of the same source.
# Either way API_IMAGE is exported as <registry>/api@sha256:<digest>, so the migrate job and the service use
# exactly this image, whatever happens to the tag later.

set -e

# The digest of an image in Artifact Registry, by tag or by digest reference.
digest_of() {
  gcloud artifacts docker images describe "$1" --format='value(image_summary.digest)'
}

if [[ "$TARGET_ENV" == production ]]; then
  if [[ -z "$PROMOTE_FROM_REGISTRY" ]]; then
    echo "::error::GCP_PROMOTE_FROM_REGISTRY is not set in the GitHub environment 'production': production deploys the image staging ran and needs to know where it is (infra/README.md)."
    exit 1
  fi
  source_image="$PROMOTE_FROM_REGISTRY/api:staging-ok-$APP_VERSION"
  # The staging registry may be on another host than the production one.
  gcloud auth configure-docker "${PROMOTE_FROM_REGISTRY%%/*}" --quiet
  if ! source_digest="$(digest_of "$source_image")" || [[ -z "$source_digest" ]]; then
    echo "::error::$source_image does not exist or cannot be read: this commit never passed a staging deploy (the smoke test of the staging deploy sets that tag), the image was cleaned up, or the production deployer may not read the staging registry (OpenTofu variable image_readers of the staging stack). Deploy this commit to staging first, or tag a commit that was."
    exit 1
  fi
  # A registry-to-registry copy: the manifest is not rewritten, so the digest does not change.
  docker buildx imagetools create --tag "$API_IMAGE" "$source_image"
  destination_digest="$(digest_of "$API_IMAGE")"
  if [[ "$destination_digest" != "$source_digest" ]]; then
    echo "::error::The promoted image differs from the one staging ran: $source_digest in staging, $destination_digest in production. Refusing to deploy it."
    exit 1
  fi
  digest="$source_digest"
else
  docker build -f apps/api/Dockerfile --build-arg "APP_VERSION=$APP_VERSION" -t "$API_IMAGE" .
  docker push "$API_IMAGE"
  digest="$(digest_of "$API_IMAGE")"
fi

echo "API_IMAGE=${API_IMAGE%:"$APP_VERSION"}@$digest" >> "$GITHUB_ENV"
echo "::notice::API image of the $TARGET_ENV deploy: ${API_IMAGE%:"$APP_VERSION"}@$digest"
