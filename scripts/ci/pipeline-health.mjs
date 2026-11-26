// How long the pipeline takes and how often it is wrong, measured from the workflow runs GitHub recorded:
//   node scripts/ci/pipeline-health.mjs --days 28        (prints Markdown; reads GITHUB_REPOSITORY, GITHUB_TOKEN)
// Three numbers a gate is judged by: the wall time of a green pull-request run per workflow, the time from the
// first job starting to the last check turning green per commit, and the jobs that failed and then passed on a
// rerun of the same commit. The functions are pure; only measureAndPrint() talks to the API.
import { fileURLToPath } from 'node:url'

const seconds = (run) => (Date.parse(run.updated_at) - Date.parse(run.run_started_at)) / 1000
const isGreen = (run) => run.status === 'completed' && run.conclusion === 'success'
const byName = (a, b) => a.workflow.localeCompare(b.workflow)

/** Nearest-rank percentile; undefined for an empty list. */
export function percentile(values, p) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
}

/** Per workflow: the wall time of its green pull-request runs. Failed and cancelled runs say nothing about speed. */
export function workflowDurations(runs) {
  const groups = new Map()
  for (const run of runs.filter((r) => r.event === 'pull_request' && isGreen(r))) {
    groups.set(run.name, [...(groups.get(run.name) ?? []), seconds(run)])
  }
  return [...groups].map(([workflow, values]) => ({ workflow, runs: values.length, p50: percentile(values, 50), p95: percentile(values, 95) })).sort(byName)
}

/** Per commit of a pull request: first job start to last green check, for commits where every workflow went green. */
export function timeToGreen(runs) {
  const commits = new Map()
  for (const run of runs.filter((r) => r.event === 'pull_request')) commits.set(run.head_sha, [...(commits.get(run.head_sha) ?? []), run])
  const spans = [...commits.values()]
    .filter((group) => group.every(isGreen))
    .map((group) => (Math.max(...group.map((r) => Date.parse(r.updated_at))) - Math.min(...group.map((r) => Date.parse(r.run_started_at)))) / 1000)
  return { commits: spans.length, p50: percentile(spans, 50), p95: percentile(spans, 95) }
}

/** Per workflow: pushes to main that finished, and how many of them failed. A red main is a gate that let something through. */
export function mainHealth(runs) {
  const groups = new Map()
  for (const run of runs.filter((r) => r.event === 'push' && r.head_branch === 'main' && r.status === 'completed' && r.conclusion !== 'cancelled')) {
    const row = groups.get(run.name) ?? { workflow: run.name, runs: 0, failed: 0 }
    row.runs += 1
    if (run.conclusion !== 'success') row.failed += 1
    groups.set(run.name, row)
  }
  return [...groups.values()].sort(byName)
}

/**
 * Jobs that failed in one attempt of a run and passed in a later attempt: the same commit, a different result.
 * `rerun` is `[{ workflow, attempts: [[{ name, conclusion }, …], …] }]`, attempts in order.
 */
export function flakyJobs(rerun) {
  const counts = new Map()
  for (const { workflow, attempts } of rerun) {
    const failedEarlier = new Set()
    const flaky = new Set()
    for (const jobs of attempts) {
      for (const job of jobs) if (job.conclusion === 'success' && failedEarlier.has(job.name)) flaky.add(job.name)
      for (const job of jobs) if (job.conclusion === 'failure') failedEarlier.add(job.name)
    }
    for (const job of flaky) counts.set(`${workflow}\n${job}`, (counts.get(`${workflow}\n${job}`) ?? 0) + 1)
  }
  return [...counts].map(([key, times]) => ({ workflow: key.split('\n')[0], job: key.split('\n')[1], times })).sort((a, b) => b.times - a.times || byName(a, b))
}

const minutes = (value) => (value === undefined ? '–' : `${Math.round(value / 60)} min`)
const cell = (text) => String(text).replaceAll('|', '\\|')

export function reportMarkdown({ days, until, durations, green, main, flaky, rerunRuns, totalRuns }) {
  const lines = [`## Pipeline health — ${days} days to ${until}`, '']
  lines.push('### Green pull-request runs, wall time per workflow', '', '| Workflow | Runs | Median | 95th percentile |', '|---|---|---|---|')
  for (const row of durations) lines.push(`| ${cell(row.workflow)} | ${row.runs} | ${minutes(row.p50)} | ${minutes(row.p95)} |`)
  lines.push('', '### Time to green per commit', '')
  lines.push(
    green.commits === 0
      ? 'No pull-request commit went green in every workflow in this window.'
      : `${green.commits} commit(s) went green in every workflow: median ${minutes(green.p50)}, 95th percentile ${minutes(green.p95)} from the first job starting to the last check passing.`,
  )
  lines.push('', '### Pushes to main', '', '| Workflow | Finished runs | Failed | Failure rate |', '|---|---|---|---|')
  for (const row of main) lines.push(`| ${cell(row.workflow)} | ${row.runs} | ${row.failed} | ${Math.round((row.failed / row.runs) * 100)} % |`)
  lines.push('', '### Flaky jobs', '')
  if (flaky.length === 0) lines.push(`No job failed and then passed on a rerun (${rerunRuns} of ${totalRuns} runs were rerun).`)
  else {
    lines.push(`${rerunRuns} of ${totalRuns} runs were rerun. Jobs that failed and then passed on a rerun of the same commit:`, '', '| Workflow | Job | Times |', '|---|---|---|')
    for (const row of flaky) lines.push(`| ${cell(row.workflow)} | ${cell(row.job)} | ${row.times} |`)
  }
  lines.push('', 'Limit: a flake is only visible here when someone reran the job; a failure that a new push fixed is not counted, and neither is a run a newer push cancelled.', '')
  return lines.join('\n')
}

async function api(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'steuereule-pipeline-health' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const response = await fetch(`https://api.github.com${path}`, { headers })
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}`)
  return response.json()
}

/** Every page of a list endpoint; `key` is the array in the response body. */
async function pages(path, key) {
  const all = []
  for (let page = 1; ; page += 1) {
    const body = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    all.push(...body[key])
    if (body[key].length < 100) return all
  }
}

async function measureAndPrint() {
  const argDays = process.argv.indexOf('--days')
  const days = argDays === -1 ? 28 : Number(process.argv[argDays + 1])
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('--days must be a whole number from 1 to 90')
  const repo = process.env.GITHUB_REPOSITORY || 'NexusHero/Steuereule'
  const today = new Date()
  const runs = []
  // One query per day: the API returns at most 1000 runs per query, and a busy week exceeds that.
  for (let back = 0; back < days; back += 1) {
    const day = new Date(today.getTime() - back * 86_400_000).toISOString().slice(0, 10)
    runs.push(...(await pages(`/repos/${repo}/actions/runs?created=${day}`, 'workflow_runs')))
  }
  const rerun = []
  for (const run of runs.filter((r) => r.run_attempt > 1)) {
    const attempts = []
    for (let attempt = 1; attempt <= run.run_attempt; attempt += 1) attempts.push(await pages(`/repos/${repo}/actions/runs/${run.id}/attempts/${attempt}/jobs`, 'jobs'))
    rerun.push({ workflow: run.name, attempts })
  }
  process.stdout.write(
    reportMarkdown({
      days,
      until: today.toISOString().slice(0, 10),
      durations: workflowDurations(runs),
      green: timeToGreen(runs),
      main: mainHealth(runs),
      flaky: flakyJobs(rerun),
      rerunRuns: rerun.length,
      totalRuns: runs.length,
    }),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  measureAndPrint().catch((error) => {
    console.error(`pipeline-health: ${error.message}`)
    process.exit(1)
  })
}
