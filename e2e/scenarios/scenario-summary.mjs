// The table a scenario job writes to its check page (GitHub job summary): which scenarios the group holds, what
// each one covers, how it ended and how long it took, so nobody has to open the log to see what was tested.
import { appendFileSync } from 'node:fs'

const STATUS = { passed: '✅ passed', failed: '❌ failed', running: '❌ failed' }
const cell = (text) => String(text).replaceAll('|', '\\|')

/** Markdown for one run: every selected unit, in order, with its result or "not run". */
export function summaryMarkdown(label, units, results) {
  const byId = new Map(results.map((result) => [result.id, result]))
  const rows = units.map((unit) => {
    const result = byId.get(unit.id)
    const status = result === undefined ? '⏭ not run' : STATUS[result.status]
    const duration = result?.status === 'passed' ? `${Math.round(result.seconds)} s` : '–'
    return `| ${cell(unit.id)} | ${cell(unit.title)} | ${status} | ${duration} |`
  })
  return [`### ${label}`, '', '| Scenario | What it covers | Result | Duration |', '|---|---|---|---|', ...rows, ''].join('\n')
}

/** Appends the summary to the job's summary file; outside GitHub Actions there is none and nothing is written. */
export function writeScenarioSummary(label, units, results, env = process.env) {
  if (!env.GITHUB_STEP_SUMMARY) return
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${summaryMarkdown(label, units, results)}\n`)
}
