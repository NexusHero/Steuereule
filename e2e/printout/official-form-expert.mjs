// The official form on its own screen and the expert mode (#formular-direkteingabe): from the
// cockpit and from a mask to the form, switching the expert mode there and in the profile, a
// direct save that reaches the API, a computed field that stays locked, and the copy chips that
// pick which child a field writes to. The values come from `GET ausdruck/werte`, before payment.
import { launchBrowser, closeBrowser, newContextAtBreakpoint, guardAgainst429 } from '../harness/browser.mjs'
import { startStack } from '../harness/stack.mjs'
import { fail } from '../harness/rate-limit.mjs'
import { createAccount, call, answer, putLstb, putPrintableBasics, browserLogin, until } from '../harness/api-account.mjs'

const TAG = 'official-form-expert'
const YEAR = 2025

/** react-native-web renders a Switch as a checkbox inside the element carrying the testID. */
const switchIn = (page, testId) => page.locator(`[data-testid="${testId}"] input[type="checkbox"]`)

async function main() {
  const { apiOrigin, webOrigin, sql, stop } = await startStack()
  const browser = await launchBrowser()
  try {
    const user = await createAccount({ apiOrigin, webOrigin, sql, tag: TAG })
    const api = user.api
    await putPrintableBasics(api, { firstName: 'Ina', lastName: 'Formfest' })
    await answer(api, YEAR, [['job', 'Angestellt'], ['ausland', 'Nein'], ['kinder', '2 oder mehr'], ['familienstand', 'Ledig']])
    await putLstb(api, YEAR, 45_000, 6_100, 9_200)
    // Work equipment gives the Anlage N a computed field (Kz 320) next to the editable Kz 110.
    await call(api, 'PUT', `/v1/steuerjahre/${YEAR}/arbeitsweg`, {
      workdays: [1, 2, 3, 4, 5], vacationDays: 30, sickDays: 5, homeOfficeDays: 0, oneWayKm: 12, transport: 'pkw', workplace: null, workEquipmentEur: 420,
    })
    await call(api, 'POST', `/v1/steuerjahre/${YEAR}/kinder`, { firstName: 'Mia', lastName: 'Formfest', geburtsdatum: '2017-05-01' })
    await call(api, 'POST', `/v1/steuerjahre/${YEAR}/kinder`, { firstName: 'Ben', lastName: 'Formfest', geburtsdatum: '2020-09-14' })
    // Not paid on purpose: the live values are free, only the PDF is paid (ADR-0050).
    const live = await call(api, 'GET', `/v1/steuerjahre/${YEAR}/ausdruck/werte`)
    const kindCopies = live.forms.find((f) => f.formular === 'anlage-kind')?.instances ?? []
    if (kindCopies.length !== 2 || kindCopies.some((c) => !c.entityId)) fail(`ausdruck/werte must return one Anlage Kind per child with its id, got ${JSON.stringify(kindCopies)}`)
    console.log(`[${TAG}] ✅ ausdruck/werte — unpaid, two Anlage Kind copies with their child ids`)

    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail, '/api/auth/')
    await browserLogin(page, webOrigin, user.email, TAG)

    // Cockpit → the form on its own screen.
    const cockpitEntry = page.locator('[data-testid="cockpit-formular"]')
    await cockpitEntry.waitFor({ state: 'visible', timeout: 15_000 })
    await cockpitEntry.click()
    await page.waitForURL((u) => u.pathname === `/app/steuerjahr/${YEAR}/formular`, { timeout: 15_000 })
    console.log(`[${TAG}] ✅ cockpit-formular — opens the official form screen`)

    // Expert mode off: no markings. Switched on right on the screen: legend and markings appear.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/formular/anlage-n`, { waitUntil: 'networkidle' })
    await page.locator('[aria-label*="Kz 110 Bruttoarbeitslohn"]').first().waitFor({ state: 'visible', timeout: 20_000 })
    if ((await page.locator('[data-testid="acro-legend"]').count()) !== 0) fail('without the expert mode there must be no legend')
    await switchIn(page, 'formular-expertenmodus').click()
    await page.locator('[data-testid="acro-legend"]').waitFor({ state: 'visible', timeout: 5_000 })
    const kz110 = page.locator('[data-testid="acro-field-editable-anlN.kz110"]')
    await kz110.waitFor({ state: 'visible', timeout: 5_000 })
    console.log(`[${TAG}] ✅ formular-expertenmodus — legend and ✎ marking appear`)

    // A direct save reaches the LStB, with honest feedback.
    await kz110.click()
    await page.getByLabel(/Direkteingabe Anlage N · Zeile 6/).fill('46.500')
    await page.getByText('✓ Direkt speichern').click()
    const feedback = page.locator('[data-testid="acro-save-feedback"]')
    await feedback.waitFor({ state: 'visible', timeout: 10_000 })
    if (!(await feedback.textContent())?.includes('Gespeichert.')) fail(`expected "Gespeichert.", got "${await feedback.textContent()}"`)
    await until(async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/lstb`)).bruttoarbeitslohn.value, 46_500, 'the direct input must store Kz 110 in the LStB')
    console.log(`[${TAG}] ✅ acro-save-feedback — Kz 110 saved through the LStB endpoint`)

    // A computed field stays locked and names its sources (Kz 320 is on page 3 of the Anlage N).
    for (let i = 0; i < 2; i++) await page.getByText('Seite ▶').click()
    const computed = page.locator('[data-testid="acro-field-computed-anlN.kz320"]')
    await computed.waitFor({ state: 'visible', timeout: 10_000 })
    await computed.click()
    await page.locator('[data-testid="acro-derived-hint"]').waitFor({ state: 'visible', timeout: 5_000 })
    if ((await page.getByLabel(/^Direkteingabe/).count()) !== 0) fail('a computed field must offer no direct input')
    console.log(`[${TAG}] ✅ acro-derived-hint — computed Kz 320 is read-only`)

    // Two children: the copy chips pick which child a field writes to.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/formular/anlage-kind`, { waitUntil: 'networkidle' })
    const copies = page.locator('[data-testid="acro-copies"]')
    await copies.waitFor({ state: 'visible', timeout: 20_000 })
    await copies.getByText('Kind: Ben').click()
    await page.locator('[data-testid="acro-field-editable-anlKind.vorname"]').click()
    await page.getByLabel(/Direkteingabe Anlage Kind · vorname/).fill('Benno')
    await page.getByText('✓ Direkt speichern').click()
    await page.locator('[data-testid="acro-save-feedback"]').waitFor({ state: 'visible', timeout: 10_000 })
    const names = async () => (await call(api, 'GET', `/v1/steuerjahre/${YEAR}/kinder`)).kinder.map((k) => k.firstName).sort().join(',')
    await until(names, 'Benno,Mia', 'the second copy must write to the second child only')
    console.log(`[${TAG}] ✅ acro-copies — the edit lands on the child of the selected copy`)

    // A mask links to its form instead of carrying an owl bar.
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/lstb`, { waitUntil: 'networkidle' })
    const maskLink = page.locator('[data-testid="official-form-link"]')
    await maskLink.waitFor({ state: 'visible', timeout: 15_000 })
    if ((await page.locator('[data-testid="in-mask-advisor-trigger"]').count()) !== 0) fail('the mask must not show the owl bar any more')
    await maskLink.click()
    await page.waitForURL((u) => u.pathname === `/app/steuerjahr/${YEAR}/formular/anlage-n`, { timeout: 15_000 })
    console.log(`[${TAG}] ✅ official-form-link — LStB mask opens Anlage N`)

    // The profile shows the same switch; turning it off there removes the markings.
    await page.goto(`${webOrigin}/app/profil`, { waitUntil: 'networkidle' })
    const profileSwitch = switchIn(page, 'profil-expertenmodus')
    await profileSwitch.waitFor({ state: 'attached', timeout: 15_000 })
    if (!(await profileSwitch.isChecked())) fail('the expert mode switched on in the form must show as on in the profile')
    await profileSwitch.click()
    await page.goto(`${webOrigin}/app/steuerjahr/${YEAR}/formular/anlage-n`, { waitUntil: 'networkidle' })
    await page.locator('[aria-label*="Kz 110 Bruttoarbeitslohn"]').first().waitFor({ state: 'visible', timeout: 20_000 })
    if ((await page.locator('[data-testid="acro-legend"]').count()) !== 0) fail('after switching off in the profile the form must show no legend')
    console.log(`[${TAG}] ✅ profil-expertenmodus — the profile switch controls the form`)

    await ctx.close()
    await api.dispose()
    console.log(`[${TAG}] PASS — official form screen, expert mode, direct save, locked fields and copies verified.`)
  } finally {
    await closeBrowser(browser)
    await stop()
  }
}

main().catch((err) => {
  console.error(`[${TAG}] FAIL`, err)
  process.exit(1)
})
