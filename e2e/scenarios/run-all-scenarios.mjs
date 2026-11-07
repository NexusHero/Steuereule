// Master E2E Runner: executes all 23 scenarios (01–23) sequentially against a shared stack and browser.
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

async function main() {
  console.log('='.repeat(80))
  console.log('STARTING COMPLETE 23-SCENARIO PLAYWRIGHT ACCEPTANCE & DIALOG-MATRIX SUITE')
  console.log('='.repeat(80))

  const stack = await startStack()
  const browser = await launchBrowser()

  try {
    await runScenario01(browser, stack.webOrigin, stack.sql)
    const markusSession = await runScenario02(browser, stack.webOrigin, stack.sql, { keepOpen: true })
    await runScenario03(browser, stack.webOrigin, stack.sql, markusSession)
    await runScenario04(browser, stack.webOrigin, stack.sql)
    await runScenario05(browser, stack.webOrigin, stack.sql)
    await runScenario06(browser, stack.webOrigin, stack.sql)
    await runScenario07(browser, stack.webOrigin, stack.sql)
    await runScenario08(browser, stack.webOrigin, stack.sql)
    await runScenario09(browser, stack.webOrigin, stack.sql)
    await runScenario10(browser, stack.webOrigin, stack.sql)
    await runScenario11(browser, stack.webOrigin, stack.sql)
    await runScenario12(browser, stack.webOrigin, stack.sql)
    await runScenario13(browser, stack.webOrigin, stack.sql)
    await runScenario14(browser, stack.webOrigin, stack.sql)
    await runScenario15(browser, stack.webOrigin, stack.sql)
    await runScenario16(browser, stack.webOrigin, stack.sql)
    await runScenario17(browser, stack.webOrigin, stack.sql)
    await runScenario18(browser, stack.webOrigin, stack.sql)
    await runScenario19(browser, stack.webOrigin, stack.sql)
    await runScenario20(browser, stack.webOrigin, stack.sql)
    await runScenario21(browser, stack.webOrigin, stack.sql)
    await runScenario22(browser, stack.webOrigin, stack.sql)
    await runScenario23(browser, stack.webOrigin, stack.sql)

    console.log('\n' + '='.repeat(80))
    console.log('ALL 23 SCENARIOS PASSED WITH ZERO FINDINGS OR REGRESSIONS!')
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
