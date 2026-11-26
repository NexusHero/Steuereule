// node --test e2e/scenarios/scenario-summary.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { summaryMarkdown, writeScenarioSummary } from './scenario-summary.mjs'

const units = [
  { id: '12', title: 'Carlos Santos — CH-only gate' },
  { id: '15', title: 'Hybrid Swiss expat' },
  { id: '27', title: 'Real case | to the cent' },
]

test('the summary names every scenario of the group, what ended how, and what never ran', () => {
  const markdown = summaryMarkdown('SCENARIO GROUP cross-border CH', units, [
    { id: '12', status: 'passed', seconds: 4.2 },
    { id: '15', status: 'failed', seconds: 0 },
  ])
  assert.match(markdown, /^### SCENARIO GROUP cross-border CH$/m)
  assert.match(markdown, /^\| 12 \| Carlos Santos — CH-only gate \| ✅ passed \| 4 s \|$/m)
  assert.match(markdown, /^\| 15 \| Hybrid Swiss expat \| ❌ failed \| – \|$/m)
  assert.match(markdown, /^\| 27 \| Real case \\\| to the cent \| ⏭ not run \| – \|$/m)
})

test('it appends to GITHUB_STEP_SUMMARY and does nothing without it', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'scenario-summary-')), 'summary.md')
  writeScenarioSummary('G', units, [], { GITHUB_STEP_SUMMARY: file })
  assert.match(readFileSync(file, 'utf8'), /\| 27 \|/)
  assert.doesNotThrow(() => writeScenarioSummary('G', units, [], {}))
})
