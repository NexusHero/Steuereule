// What today's main commits added to the app (21.11.2026), in a real browser on the real stack, so the E2E
// coverage ratchet (#450 5I) stays honest: the assistant's access in the profile, the tasks of the
// confirmation and the cockpit, what the cockpit still needs, the optional Veranlagungsart in the Abgabe,
// the children's printout hint, the child mask's save states, the Günstigerprüfung figures, the paged Belege
// inbox, the stored receipts in the chat, the scanned LStB lines and a draft card's companion values.
//
// Each row is a module in ./rows/ with `run(ctx)`; it seeds what it needs through the API and serves by
// a route mock only what the stack cannot produce on demand (a scan result, a long inbox). Invented data only.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, browserLogin, until } from '../harness/api-account.mjs'
import { run as assistantAccess } from './rows/assistant-access.mjs'
import { run as tasksAndCockpit } from './rows/tasks-and-cockpit.mjs'
import { run as childrenCapitalReceipts } from './rows/children-capital-receipts.mjs'
import { run as lstbAndDrafts } from './rows/lstb-and-drafts.mjs'

const TAG = 'main-coverage'
const YEAR = 2025
const tid = (id) => `[data-testid="${id}"]`

async function visible(page, id, row, timeout = 15_000) {
  await page
    .locator(tid(id))
    .first()
    .waitFor({ state: 'visible', timeout })
    .catch(() => fail(`${row}: "${id}" should be visible`))
}

async function gone(page, id, row) {
  if (await page.locator(tid(id)).count()) fail(`${row}: "${id}" should not be there`)
}

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    // One fresh account per row group: a row's seed never leaks into another's expectations.
    for (const [name, run] of [
      ['assistant-access', assistantAccess],
      ['tasks-and-cockpit', tasksAndCockpit],
      ['children-capital-receipts', childrenCapitalReceipts],
      ['lstb-and-drafts', lstbAndDrafts],
    ]) {
      const user = await createAccount({ apiOrigin, webOrigin, sql, tag: `${TAG}-${name}` })
      const ctx = await newContextAtBreakpoint(browser, 'l')
      const page = await ctx.newPage()
      guardAgainst429(page, fail, '/api/auth/')
      await browserLogin(page, webOrigin, user.email, TAG)
      await run({ page, api: user.api, user, apiOrigin, webOrigin, sql, YEAR, tid, visible, gone, fail, call, answer, until, TAG })
      await ctx.close()
    }
    console.log(`[${TAG}] PASS — today's additions reached in the browser.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
