// Looks up whether a GitHub issue is open, for check 5's `@documents-defect #NNN` marker
// (a test that documents a known, unfixed defect must cite a still-open ticket — the day
// that ticket closes, the citation goes stale until someone re-reads it).
//
// Reads `GITHUB_REPOSITORY` (owner/repo, set automatically by GitHub Actions) and
// `GITHUB_TOKEN` (higher rate limit; also works unauthenticated against a public repo, just
// with a much lower ceiling — useful for a local dry run). A network/API failure throws
// rather than silently treating the issue as open: a check that can't reach its own source
// of truth must fail loud, not fail open (the same principle ADR-0021/#234 name for a claim
// of absence — checked against the real source, not assumed).

const DEFAULT_REPO = 'NexusHero/Steuereule'

/** @type {Map<number, boolean>} */
const cache = new Map()

/**
 * @param {number} issueNumber
 * @returns {Promise<boolean>} true if the issue is open
 */
export async function isIssueOpen(issueNumber) {
  if (cache.has(issueNumber)) return cache.get(issueNumber)
  const repo = process.env.GITHUB_REPOSITORY || DEFAULT_REPO
  const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}`
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'steuereule-register-check' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(
      `Could not look up issue #${issueNumber} on ${repo} (GitHub API returned ${response.status}) — ` +
        'the @documents-defect check cannot honestly report a result without this, so it fails loud rather than assuming open.',
    )
  }
  const body = await response.json()
  const open = body.state === 'open'
  cache.set(issueNumber, open)
  return open
}
