#!/usr/bin/env node
// The decision of the release guard (.github/workflows/release.yml, job `guard`; ADR-0113). A production deploy
// is allowed only for a release tag whose commit is on main and passed "Build & E2E" as a push run.
// scripts/release/guard.sh collects the facts (git, the GitHub API) and this file decides; the decision is a pure
// function so that node --test scripts/release/guard.test.mjs can pin every refusal.
import { fileURLToPath } from 'node:url'

/** The `name:` of .github/workflows/ci.yml. deployment-wiring.test.ts checks that it exists. */
export const CI_WORKFLOW_NAME = 'Build & E2E'

// vMAJOR.MINOR.PATCH without leading zeros, optional pre-release part, no build metadata.
const RELEASE_REF = /^refs\/tags\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/

export function isReleaseRef(ref) {
  return typeof ref === 'string' && RELEASE_REF.test(ref)
}

/** True when `runs` holds a finished, successful push run of the CI workflow for exactly `sha`. */
export function hasSuccessfulPushRun(runs, sha) {
  if (!Array.isArray(runs) || !sha) return false
  return runs.some(
    (candidate) =>
      candidate?.name === CI_WORKFLOW_NAME &&
      candidate.event === 'push' &&
      candidate.status === 'completed' &&
      candidate.conclusion === 'success' &&
      candidate.head_sha === sha,
  )
}

/**
 * @param {{ ref?: string, sha?: string, onMain?: boolean, runs?: object[] }} facts
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function decide({ ref, sha, onMain, runs }) {
  const errors = []
  if (!isReleaseRef(ref)) {
    errors.push(
      `Production deploys run from a release tag vMAJOR.MINOR.PATCH, and this run is on "${ref ?? ''}". Publish a release for a tag like v1.2.3, or re-run the Release workflow from such a tag.`,
    )
  }
  if (onMain !== true) {
    errors.push(
      'The tagged commit is not on main. Tag a commit that is on main (a release is cut from main only), then publish the release again.',
    )
  }
  if (!hasSuccessfulPushRun(runs, sha)) {
    errors.push(
      `No successful "${CI_WORKFLOW_NAME}" push run exists for commit ${sha || '(unknown)'}. Wait for the run on main to finish green, or tag a commit that has one.`,
    )
  }
  return { ok: errors.length === 0, errors }
}

function main(env) {
  let runs
  try {
    runs = JSON.parse(env.RUNS_JSON ?? '').workflow_runs
  } catch {
    runs = undefined
  }
  const { ok, errors } = decide({ ref: env.GITHUB_REF, sha: env.GITHUB_SHA, onMain: env.ON_MAIN === 'true', runs })
  for (const error of errors) console.log(`::error::${error}`)
  if (ok) console.log(`::notice::Release guard passed: ${env.GITHUB_REF} at ${env.GITHUB_SHA} is on main and green.`)
  return ok ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.env))
