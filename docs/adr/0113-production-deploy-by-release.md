# ADR-0113 — Production is deployed by publishing a release, with the API image staging ran

- **Status:** Accepted
- **Date:** 2026-11-26
- **Deciders:** engineering.
- **Builds on** [ADR-0053](0053-beta-hosting-cloud-run.md) (Cloud Run, the deploy workflow),
  [ADR-0109](0109-security-report-hardening.md) (staging and production as separate environments).
  **Amends** ADR-0109 §18: production is no longer "deployed by hand through the GitHub environment" but by a release,
  described below.
- **Context tags:** ci, deploy, security

## Context

Until now production was deployed by starting `deploy.yml` by hand with `environment = production`. Three things
were wrong with that:

1. **Nothing marked a production deploy as an event.** A manual run of a workflow that also deploys staging does not
   say "this is release 1.4.0", and it can be started from any commit of main, tested or not.
2. **Production rebuilt the API image.** The same commit was built a second time, so what staging had tested was
   not the artefact production ran (a changed base image, a moved dependency or a different build host would go
   unnoticed).
3. **Pull requests showed two skipped jobs.** `deploy.yml` ran on every pull request to carry the check
   `static: opentofu validate`; its two deploy jobs reported "skipped" on every pull request.

## Decision

1. **A release is the production deploy.** Publishing a GitHub Release for a tag `vX.Y.Z` runs
   `.github/workflows/release.yml` ("Release"). The same workflow can be started by hand, from the tag, to deploy an
   existing release again (a failed run, a rollback to an older release). `deploy.yml`, run by hand, now deploys
   staging only.
2. **Two jobs.** `guard` runs `scripts/release/guard.sh`, which collects the facts and lets
   `scripts/release/guard.mjs` decide. It refuses unless (a) the ref is `refs/tags/v<MAJOR>.<MINOR>.<PATCH>` with an
   optional pre-release part, (b) the tagged commit is an ancestor of `origin/main`, and (c) a successful
   "Build & E2E" run for exactly that commit exists with event `push`. Every refusal prints an error that says what to
   do. `deploy` then `needs: guard` and calls `deploy.yml` (`workflow_call`, input `environment: production`). The
   release text and tag name are never interpolated into a shell: the ref reaches the script as an environment
   variable.
3. **One deploy job, two ways in.** `deploy.yml` keeps its single deploy job, so its wiring tests keep reading it
   there. Its triggers are `workflow_run` (staging after a green "Build & E2E" on main, behind
   `DEPLOY_STAGING_AUTO`), `workflow_dispatch` (staging) and `workflow_call`. The configuration gate requires
   `refs/heads/main` for staging and `refs/tags/v*` for production. The per-environment queue
   (`deploy-<environment>`, no cancellation) is on the job, because a workflow-level group of a called workflow
   would collide with the group of its caller.
4. **No `pull_request` trigger in `deploy.yml`.** `static: opentofu validate` moved to `quality.yml` under the same
   name, so the required-check name is unchanged and pull requests no longer show skipped deploy jobs.
5. **The API image is promoted, not rebuilt.**
   - A staging deploy builds the API image as before. After its smoke test has passed it adds the registry tag
     `api:staging-ok-<commit>` (`scripts/deploy/mark-staging-proven.sh`). That tag is the only thing production
     promotes.
   - A production deploy builds no API image (`scripts/deploy/provide-api-image.sh`). It copies
     `<staging registry>/api:staging-ok-<commit>` into the production registry with
     `docker buildx imagetools create`, which does not rewrite the manifest. It reads the digest on both sides, fails
     if they differ, and fails with a clear message if the tag does not exist ("this commit never passed a staging
     deploy").
   - In both environments the script exports `API_IMAGE` as `<registry>/api@sha256:<digest>`, so the migrate job and
     the service run exactly the image that was provided, whatever happens to a tag later. The SBOM step scans the
     same reference.
6. **What is still built per environment.** The web and website images carry the operator details and the origins
   of their environment, baked in at build time (WEB-2), so production builds them from the tagged commit. Only the
   API image is promoted. Its `APP_VERSION` stays the 12-character commit id baked in at the staging build; the
   promoted image is not rebuilt, so it cannot carry the tag name.
7. **The staging registry is a production-only deploy variable.** `GCP_PROMOTE_FROM_REGISTRY`
   (`<region>-docker.pkg.dev/<staging project>/steuereule`) is optional in the declared list
   (`DEPLOY_VARIABLES`) and required by the configuration gate when the target is production; the wizard sets it
   for production.
8. **OpenTofu.** The workload identity condition of a production stack accepts only refs starting with
   `refs/tags/v`; a staging stack keeps `refs/heads/main`. The variable `image_readers` (list of IAM members,
   default empty) grants `roles/artifactregistry.reader` on the stack's image repository: the staging stack lists the
   production deployer there. A cleanup policy keeps images tagged `staging-ok-` for 30 days, so a commit proven on
   staging stays promotable for that long (the existing policies would delete an image older than a week that is not
   among the five newest).

## Security note: what the guard does not stop

A run started by a tag reads `release.yml` and `deploy.yml` from the **tagged commit**. The `guard` job is part of
that file. Someone who can push a tag on a commit with a modified workflow can remove the guard, and the guard alone
does not stop that. These controls hold regardless, and they are configured on GitHub and Google, not in this
repository. They are **required set-up, not done** until the repository owner has made them:

- On the GitHub environment `production`: required reviewers, and a deployment rule that admits only the tag pattern
  `v*` (not branches). The wizard sets both when it can create the environment; check them.
- A **tag ruleset** that restricts who may create `v*` tags (and blocks updating and deleting them).
- The OpenTofu condition of the production stack (item 8): Google rejects a token whose ref is not a `v*` tag,
  and the condition also demands the `production` environment claim, which GitHub issues only after the environment's
  rules and reviewers have passed.

## Required manual set-up

None of the following exists yet; no deploy has been run through this pipeline.

1. Apply OpenTofu in the **production** stack (new workload identity condition), then in the **staging** stack with
   `image_readers = ["serviceAccount:steuereule-deployer@<production project>.iam.gserviceaccount.com"]` (cleanup
   policy and reader grant). `infra/README.md` lists the order.
2. Set `GCP_PROMOTE_FROM_REGISTRY` in the GitHub environment `production` (the wizard does it).
3. On the environment `production`: required reviewers, deployment rule `v*` as a tag rule (remove the `main`
   branch rule).
4. Create the tag ruleset for `v*`.
5. Deploy the commit to staging first (a green run on main does this once `DEPLOY_STAGING_AUTO` is `true`), then
   publish the release.

## Consequences

- A production deploy needs a commit that has passed staging; a hotfix cannot skip staging. That is the intent.
- Because the staging smoke test sets the tag, a production deploy of a commit whose staging deploy failed or never
  ran fails at the image step, before the database backup and the migration.
- The first run of this pipeline is the first test of the registry copy, the digest query
  (`gcloud artifacts docker images describe`) and the cross-project read grant. They were checked by reading and by
  the static gates (actionlint, shellcheck, the wiring tests, the unit tests of the guard), not by a deploy.
- Rolling back means publishing or re-running a release of an older tag whose staging image still exists (30 days).

## Amendment — 2026-11-26: items 3 and 4 of the set-up are done

Set in the repository settings the same day (read back from the GitHub API; `docs/ci-pipeline.md`, "Repository
settings", lists them):

- Environment `production`: one required reviewer, deployments only from tags `v*`. Environment `staging`:
  deployments only from `main`. Self-review is allowed, because the project has one maintainer.
- Two tag rulesets for `v*`: one blocks updating and deleting such a tag for everyone, the other restricts creating
  one to repository admins.

Still open, and still required before the first release: items 1 and 2 (OpenTofu in both stacks, the variable
`GCP_PROMOTE_FROM_REGISTRY`) and item 5. No deploy has been run through this pipeline.
