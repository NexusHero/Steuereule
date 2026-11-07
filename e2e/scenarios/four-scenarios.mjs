// Acceptance gate: drives all 4 personas (Lena Hoffmann, Markus Brenner, Julia Brenner,
// Thomas & Sabine Weber) end-to-end through the real UI at every PR.
import { launchBrowser, closeBrowser, startStack, fail } from './helpers/scenario-harness.mjs'
import { runScenario01 } from './01-lena-hoffmann-angestellt.mjs'
import { runScenario02 } from './02-markus-brenner-grenzgaenger-ch.mjs'
import { runScenario03 } from './03-julia-brenner-grenzgaengerin-ch.mjs'
import { runScenario04 } from './04-weber-ehepaar-zusammenveranlagung.mjs'

async function main() {
  console.log('[four-scenarios] Starting S10 full UI acceptance test (4 personas)...')
  const stack = await startStack()
  const browser = await launchBrowser()

  try {
    await runScenario01(browser, stack.webOrigin, stack.sql)
    const markusSession = await runScenario02(browser, stack.webOrigin, stack.sql, { keepOpen: true })
    await runScenario03(browser, stack.webOrigin, stack.sql, markusSession)
    await runScenario04(browser, stack.webOrigin, stack.sql)

    console.log('\n============================================================')
    console.log('PASS: All 4 acceptance scenarios completed successfully via UI!')
    console.log('============================================================\n')
  } catch (error) {
    fail(`Acceptance test failed: ${error.message}\n${error.stack}`)
  } finally {
    await closeBrowser(browser)
    await stack.stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
