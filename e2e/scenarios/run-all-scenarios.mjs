// Master E2E Runner: executes all 26 scenarios (01–26) sequentially against a shared stack and browser.
// Supports optional sharding for CI matrix parallelism: `node e2e/scenarios/run-all-scenarios.mjs --shard 1/4`
import { launchBrowser, closeBrowser, startStack, fail } from './helpers/scenario-harness.mjs'
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

function parseShardArgs(argv) {
  const idx = argv.indexOf('--shard')
  if (idx === -1 || !argv[idx + 1]) {
    return null
  }
  const match = /^(\d+)\/(\d+)$/.exec(argv[idx + 1])
  if (!match) {
    throw new Error(`Invalid --shard format '${argv[idx + 1]}'. Expected '<index>/<total>', e.g. '1/4'.`)
  }
  const shardIndex = Number(match[1])
  const shardTotal = Number(match[2])
  if (shardIndex < 1 || shardTotal < 1 || shardIndex > shardTotal) {
    throw new Error(`Invalid --shard bounds '${argv[idx + 1]}'.`)
  }
  return { shardIndex, shardTotal }
}

// Scenario 02 & 03 are coupled (Julia couples with Markus's open session), so they form a single execution unit.
const SCENARIO_UNITS = [
  {
    name: 'Scenario 01',
    run: (browser, webOrigin, sql) => runScenario01(browser, webOrigin, sql),
  },
  {
    name: 'Scenario 02 + 03 (Coupled Cross-Border Household)',
    run: async (browser, webOrigin, sql) => {
      const markusSession = await runScenario02(browser, webOrigin, sql, { keepOpen: true })
      await runScenario03(browser, webOrigin, sql, markusSession)
    },
  },
  { name: 'Scenario 04', run: (browser, webOrigin, sql) => runScenario04(browser, webOrigin, sql) },
  { name: 'Scenario 05', run: (browser, webOrigin, sql) => runScenario05(browser, webOrigin, sql) },
  { name: 'Scenario 06', run: (browser, webOrigin, sql) => runScenario06(browser, webOrigin, sql) },
  { name: 'Scenario 07', run: (browser, webOrigin, sql) => runScenario07(browser, webOrigin, sql) },
  { name: 'Scenario 08', run: (browser, webOrigin, sql) => runScenario08(browser, webOrigin, sql) },
  { name: 'Scenario 09', run: (browser, webOrigin, sql) => runScenario09(browser, webOrigin, sql) },
  { name: 'Scenario 10', run: (browser, webOrigin, sql) => runScenario10(browser, webOrigin, sql) },
  { name: 'Scenario 11', run: (browser, webOrigin, sql) => runScenario11(browser, webOrigin, sql) },
  { name: 'Scenario 12', run: (browser, webOrigin, sql) => runScenario12(browser, webOrigin, sql) },
  { name: 'Scenario 13', run: (browser, webOrigin, sql) => runScenario13(browser, webOrigin, sql) },
  { name: 'Scenario 14', run: (browser, webOrigin, sql) => runScenario14(browser, webOrigin, sql) },
  { name: 'Scenario 15', run: (browser, webOrigin, sql) => runScenario15(browser, webOrigin, sql) },
  { name: 'Scenario 16', run: (browser, webOrigin, sql) => runScenario16(browser, webOrigin, sql) },
  { name: 'Scenario 17', run: (browser, webOrigin, sql) => runScenario17(browser, webOrigin, sql) },
  { name: 'Scenario 18', run: (browser, webOrigin, sql) => runScenario18(browser, webOrigin, sql) },
  { name: 'Scenario 19', run: (browser, webOrigin, sql) => runScenario19(browser, webOrigin, sql) },
  { name: 'Scenario 20', run: (browser, webOrigin, sql) => runScenario20(browser, webOrigin, sql) },
  { name: 'Scenario 21', run: (browser, webOrigin, sql) => runScenario21(browser, webOrigin, sql) },
  { name: 'Scenario 22', run: (browser, webOrigin, sql) => runScenario22(browser, webOrigin, sql) },
  { name: 'Scenario 23', run: (browser, webOrigin, sql) => runScenario23(browser, webOrigin, sql) },
  { name: 'Scenario 24', run: (browser, webOrigin, sql) => runScenario24(browser, webOrigin, sql) },
  { name: 'Scenario 25', run: (browser, webOrigin, sql) => runScenario25(browser, webOrigin, sql) },
  { name: 'Scenario 26', run: (browser, webOrigin, sql) => runScenario26(browser, webOrigin, sql) },
]

async function main() {
  const shard = parseShardArgs(process.argv.slice(2))
  const selectedUnits = shard
    ? SCENARIO_UNITS.filter((_, i) => i % shard.shardTotal === shard.shardIndex - 1)
    : SCENARIO_UNITS

  console.log('='.repeat(80))
  if (shard) {
    console.log(
      `STARTING SHARD ${shard.shardIndex}/${shard.shardTotal} (${selectedUnits.map((u) => u.name).join(', ')})`,
    )
  } else {
    console.log('STARTING COMPLETE 26-SCENARIO PLAYWRIGHT ACCEPTANCE & DIALOG-MATRIX SUITE')
  }
  console.log('='.repeat(80))

  const stack = await startStack()
  const browser = await launchBrowser()

  try {
    for (const unit of selectedUnits) {
      await unit.run(browser, stack.webOrigin, stack.sql)
    }

    console.log('\n' + '='.repeat(80))
    console.log(
      shard
        ? `SHARD ${shard.shardIndex}/${shard.shardTotal} PASSED WITH ZERO FINDINGS OR REGRESSIONS!`
        : 'ALL 26 SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!',
    )
    console.log('='.repeat(80) + '\n')
  } catch (error) {
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
