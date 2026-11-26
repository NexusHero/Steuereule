// Master E2E Runner: executes all 27 scenarios (01–27) sequentially against a shared stack and browser.
// CI runs one scenario group per job (scenario-groups.mjs): `node e2e/scenarios/run-all-scenarios.mjs --group cross-border-ch`
import { launchBrowser, closeBrowser, startStack, fail } from './helpers/scenario-harness.mjs'
import { groupProblems, SCENARIO_GROUPS, unitsOfGroup } from './scenario-groups.mjs'
import { writeScenarioSummary } from './scenario-summary.mjs'
import { runScenario01 } from './01-lena-hoffmann-angestellt.mjs'
import { runScenario02 } from './02-markus-brenner-grenzgaenger-ch.mjs'
import { runScenario03 } from './03-julia-brenner-grenzgaengerin-ch.mjs'
import { runScenario04 } from './04-weber-ehepaar-zusammenveranlagung.mjs'
import { runScenario05 } from './05-hans-meyer-rentner-kapital.mjs'
import { runScenario06 } from './06-sarah-fischer-homeoffice-riester.mjs'
import { runScenario07 } from './07-david-richter-alleinerziehend.mjs'
import { runScenario08 } from './08-navigation-gast-und-alle-screens.mjs'
import { runScenario09 } from './09-maximiliane-koch-selbststaendig-gate.mjs'
import { runScenario10 } from './10-florian-weber-hybrid-beides.mjs'
import { runScenario11 } from './11-klaus-bergmann-privatrente.mjs'
import { runScenario12 } from './12-carlos-santos-expat-ch-only-gate.mjs'
import { runScenario13 } from './13-erika-zimmermann-verwitwet.mjs'
import { runScenario14 } from './14-keller-ehepaar-veranlagungsvergleich.mjs'
import { runScenario15 } from './15-martina-vogt-hybrid-schweiz.mjs'
import { runScenario16 } from './16-sabine-kranz-geschieden-kind.mjs'
import { runScenario17 } from './17-maximilian-allesgeber-maximal-katalog.mjs'
import { runScenario18 } from './18-thorsten-grenzfall-arbeitstage-widerspruch.mjs'
import { runScenario19 } from './19-dialog-matrix-interview-zickzack.mjs'
import { runScenario20 } from './20-dialog-matrix-kataloge-zickzack.mjs'
import { runScenario21 } from './21-dialog-matrix-submasken-und-partner-b.mjs'
import { runScenario22 } from './22-dialog-matrix-crud-detailmasken.mjs'
import { runScenario23 } from './23-dialog-matrix-gast-upgrade-und-steuerjahre.mjs'
import { runScenario24 } from './24-advisor-chat-steuereule.mjs'
import { runScenario25 } from './25-familie-sommer-eskalation.mjs'
import { runScenario26 } from './26-familie-brandt-rente-und-zulage.mjs'
import { runScenario27 } from './27-echtfall-grenzgaenger-paar.mjs'

function parseGroupArg(argv) {
  const idx = argv.indexOf('--group')
  if (idx === -1) return null
  const key = argv[idx + 1]
  if (key === undefined || key.startsWith('--')) throw new Error(`--group needs a group key: ${Object.keys(SCENARIO_GROUPS).join(', ')}`)
  return key
}

const SCENARIO_UNITS = [
  {
    id: '01',
    title: 'Lena Hoffmann — single DE employee, commute, donations',
    name: 'Scenario 01',
    run: (browser, webOrigin, sql) => runScenario01(browser, webOrigin, sql),
  },
  {
    id: '02+03',
    title: 'Markus & Julia Brenner — Swiss cross-border couple, 2 children, coupling and joint printout',
    name: 'Scenario 02 + 03 (Coupled Cross-Border Household)',
    run: async (browser, webOrigin, sql) => {
      const markusSession = await runScenario02(browser, webOrigin, sql, { keepOpen: true })
      await runScenario03(browser, webOrigin, sql, markusSession)
    },
  },
  { id: '04', title: 'Thomas & Sabine Weber — married DE, 3 rentals, 50k capital income', name: 'Scenario 04', run: (browser, webOrigin, sql) => runScenario04(browser, webOrigin, sql) },
  { id: '05', title: 'Hans Meyer — retiree with statutory pension and capital income', name: 'Scenario 05', run: (browser, webOrigin, sql) => runScenario05(browser, webOrigin, sql) },
  { id: '06', title: 'Sarah Fischer — remote worker, 180 home-office days, relocation, Riester, Bavaria', name: 'Scenario 06', run: (browser, webOrigin, sql) => runScenario06(browser, webOrigin, sql) },
  { id: '07', title: 'David Richter — single parent, Kindergeld, § 24b relief', name: 'Scenario 07', run: (browser, webOrigin, sql) => runScenario07(browser, webOrigin, sql) },
  { id: '08', title: 'Navigation — every screen, back buttons, settings, viewports', name: 'Scenario 08', run: (browser, webOrigin, sql) => runScenario08(browser, webOrigin, sql) },
  { id: '09', title: 'Maximiliane Koch — freelancer, Gewerbe gate', name: 'Scenario 09', run: (browser, webOrigin, sql) => runScenario09(browser, webOrigin, sql) },
  { id: '10', title: 'Florian Weber — employed plus side business ("Beides")', name: 'Scenario 10', run: (browser, webOrigin, sql) => runScenario10(browser, webOrigin, sql) },
  { id: '11', title: 'Klaus Bergmann — private pension, § 22 Ertragsanteil', name: 'Scenario 11', run: (browser, webOrigin, sql) => runScenario11(browser, webOrigin, sql) },
  { id: '12', title: 'Carlos Santos — expat with non-Swiss foreign income, CH-only gate', name: 'Scenario 12', run: (browser, webOrigin, sql) => runScenario12(browser, webOrigin, sql) },
  { id: '13', title: 'Erika Zimmermann — widowed, Gnadensplitting', name: 'Scenario 13', run: (browser, webOrigin, sql) => runScenario13(browser, webOrigin, sql) },
  { id: '14', title: 'Michael & Sandra Keller — married, filing-type comparison', name: 'Scenario 14', run: (browser, webOrigin, sql) => runScenario14(browser, webOrigin, sql) },
  { id: '15', title: 'Hybrid Swiss expat — side business, Switzerland, married, 1 child', name: 'Scenario 15', run: (browser, webOrigin, sql) => runScenario15(browser, webOrigin, sql) },
  { id: '16', title: 'Divorced parent with 1 child', name: 'Scenario 16', run: (browser, webOrigin, sql) => runScenario16(browser, webOrigin, sql) },
  { id: '17', title: 'Maximal catalogue — every life event answered yes, with follow-ups', name: 'Scenario 17', run: (browser, webOrigin, sql) => runScenario17(browser, webOrigin, sql) },
  { id: '18', title: 'Workdays contradiction at the boundary', name: 'Scenario 18', run: (browser, webOrigin, sql) => runScenario18(browser, webOrigin, sql) },
  { id: '19', title: 'Dialog matrix — interview zig-zag and gate recovery', name: 'Scenario 19', run: (browser, webOrigin, sql) => runScenario19(browser, webOrigin, sql) },
  { id: '20', title: 'Dialog matrix — catalogues zig-zag, follow-ups, back navigation', name: 'Scenario 20', run: (browser, webOrigin, sql) => runScenario20(browser, webOrigin, sql) },
  { id: '21', title: 'Dialog matrix — sub-screens in master data, printout, confirmation', name: 'Scenario 21', run: (browser, webOrigin, sql) => runScenario21(browser, webOrigin, sql) },
  { id: '22', title: 'Dialog matrix — CRUD and chip permutations in detail screens', name: 'Scenario 22', run: (browser, webOrigin, sql) => runScenario22(browser, webOrigin, sql) },
  { id: '23', title: 'Dialog matrix — guest-to-account upgrade, multi-year isolation', name: 'Scenario 23', run: (browser, webOrigin, sql) => runScenario23(browser, webOrigin, sql) },
  { id: '24', title: 'Advisor chat — citations, apply/undo, two paths, red-team guardrails', name: 'Scenario 24', run: (browser, webOrigin, sql) => runScenario24(browser, webOrigin, sql) },
  { id: '25', title: 'Familie Sommer — both spouses move to Switzerland, 3 children, medical costs', name: 'Scenario 25', run: (browser, webOrigin, sql) => runScenario25(browser, webOrigin, sql) },
  { id: '26', title: 'Familie Brandt — retired Person B, Kinderzulage, own account for B', name: 'Scenario 26', run: (browser, webOrigin, sql) => runScenario26(browser, webOrigin, sql) },
  // The real case of ADR-0094 through the masks: its target to the cent (API version: apps/api/test/acceptance/echtfaelle/).
  { id: '27', title: 'Real case — cross-border couple with child, 2024 and 2025, to the cent', name: 'Scenario 27', run: (browser, webOrigin) => runScenario27(browser, webOrigin) },
]

async function main() {
  // A unit outside every group would silently run in no CI job, one without a title would be an empty row on
  // the check page; refuse before booting anything.
  const problems = [
    ...groupProblems(SCENARIO_UNITS.map((unit) => unit.id)),
    ...SCENARIO_UNITS.filter((unit) => !unit.title).map((unit) => `scenario ${unit.id} has no title for the job summary`),
  ]
  if (problems.length > 0) fail(`scenario-groups.mjs disagrees with the runner:\n  ${problems.join('\n  ')}`)
  const groupKey = parseGroupArg(process.argv.slice(2))
  const wanted = groupKey === null ? null : new Set(unitsOfGroup(groupKey))
  const selectedUnits = wanted === null ? SCENARIO_UNITS : SCENARIO_UNITS.filter((unit) => wanted.has(unit.id))
  const label = groupKey === null ? 'COMPLETE SCENARIO SUITE' : `SCENARIO GROUP ${SCENARIO_GROUPS[groupKey].title}`

  console.log('='.repeat(80))
  console.log(`STARTING ${label} (${selectedUnits.map((u) => u.name).join(', ')})`)
  console.log('='.repeat(80))

  // What ran and how it ended, for the job summary on the check's page (GITHUB_STEP_SUMMARY).
  const results = []
  const stack = await startStack()
  const browser = await launchBrowser()

  try {
    for (const unit of selectedUnits) {
      const started = Date.now()
      results.push({ id: unit.id, title: unit.title, status: 'running', seconds: 0 })
      await unit.run(browser, stack.webOrigin, stack.sql)
      Object.assign(results.at(-1), { status: 'passed', seconds: (Date.now() - started) / 1000 })
    }

    console.log('\n' + '='.repeat(80))
    console.log(`${label} PASSED WITH ZERO FINDINGS OR REGRESSIONS!`)
    writeScenarioSummary(label, selectedUnits, results)
    console.log('='.repeat(80) + '\n')
  } catch (error) {
    if (results.at(-1)?.status === 'running') results.at(-1).status = 'failed'
    writeScenarioSummary(label, selectedUnits, results)
    fail(`Complete E2E suite failed: ${error.message}\n${error.stack}`)
  } finally {
    await closeBrowser(browser)
    if (typeof stack.stop === 'function') {
      await stack.stop()
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
