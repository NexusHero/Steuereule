// BFSG (Barrierefreiheitsstärkungsgesetz) & WCAG 2.1 AA Accessibility Gate
//
// Runs @axe-core/playwright against key SteuerEule screens (Login, Registration, Cockpit,
// SteuerEule Advisor & Chat, Belege, Profil) to block critical/serious semantic and
// interactive accessibility regressions (button names, form labels, ARIA roles/attributes,
// keyboard focusability).
import AxeBuilder from '@axe-core/playwright'
import {
  launchBrowser,
  closeBrowser,
  newContextAtBreakpoint,
  guardAgainst429,
  startStack,
  fail,
  skipSplash,
  registerAndOnboard,
  selectTaxYear2025,
} from '../scenarios/helpers/scenario-harness.mjs'

// React-Native-Web renders root view wrappers without a native HTML <main> landmark and
// controls contrast via design-system tokens tested in @steuereule/ui. We enforce all
// interactive, semantic, ARIA, form-label, and keyboard WCAG 2.1 A/AA rules.
const DISABLED_RNW_STRUCTURAL_RULES = [
  'landmark-one-main',
  'page-has-heading-one',
  'region',
  'color-contrast',
]

async function assertScreenAccessible(page, screenName) {
  await page.waitForTimeout(250)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(DISABLED_RNW_STRUCTURAL_RULES)
    .analyze()

  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )

  if (blocking.length > 0) {
    const details = blocking
      .map(
        (v) =>
          `  - [${v.impact}] ${v.id}: ${v.help} (${v.helpUrl})\n` +
          v.nodes.map((n) => `      target: ${JSON.stringify(n.target)} html: ${n.html}`).join('\n'),
      )
      .join('\n')
    fail(`[a11y-audit] BFSG/WCAG 2.1 AA violation on screen "${screenName}":\n${details}`)
  }
  console.log(`[a11y-audit] PASS: ${screenName} (0 blocking WCAG 2.1 AA violations)`)
}

async function main() {
  console.log('='.repeat(80))
  console.log('STARTING BFSG / WCAG 2.1 AA ACCESSIBILITY AUDIT (@axe-core/playwright)')
  console.log('='.repeat(80))

  const stack = await startStack()
  const browser = await launchBrowser()

  try {
    const ctx = await newContextAtBreakpoint(browser, 'l')
    const page = await ctx.newPage()
    guardAgainst429(page, fail)

    // 1. LoginScreen
    await skipSplash(page, stack.webOrigin)
    await page.locator('[data-testid="login-register-link"]').waitFor({ state: 'visible', timeout: 10_000 })
    await assertScreenAccessible(page, 'LoginScreen')

    // 2. RegistrationScreen + Onboarding + CockpitScreen
    await registerAndOnboard(
      page,
      {
        email: `du+a11y.bfsg.${Date.now()}@beispiel.de`,
        firstName: 'Hannah',
        lastName: 'Barrierefrei',
        taxId: '91234567890',
      },
      stack.webOrigin,
      'a11y-audit',
    )
    await selectTaxYear2025(page)
    await assertScreenAccessible(page, 'CockpitScreen')

    // 3. OwlModeScreen (Desktop Split-Pane on 'l' or 2-tab Hinweise + Advisor Chat on mobile)
    await page.getByRole('tab', { name: 'Eule' }).click()
    await page.locator('[data-testid="eule-privacy-badge"]').waitFor({ state: 'visible', timeout: 10_000 })
    await assertScreenAccessible(page, 'OwlModeScreen (Hinweise)')

    const fragenTab = page.locator('[data-testid="eule-tab-fragen"]')
    if (await fragenTab.isVisible().catch(() => false)) {
      await fragenTab.click()
    }
    await page.locator('[data-testid="advisor-chat-panel"]').waitFor({ state: 'visible', timeout: 10_000 })
    await assertScreenAccessible(page, 'OwlModeScreen (AdvisorChatPanel)')

    // 4. BelegeScreen
    await page.getByRole('tab', { name: 'Belege' }).click()
    await page.locator('text=Wirf alles rein — wir sortieren').waitFor({ state: 'visible', timeout: 10_000 })
    await assertScreenAccessible(page, 'BelegeScreen')

    // 5. ProfilScreen
    await page.getByRole('tab', { name: 'Profil' }).click()
    await page.locator('text=Hannah Barrierefrei').waitFor({ state: 'visible', timeout: 10_000 })
    await assertScreenAccessible(page, 'ProfilScreen')

    await ctx.close()
    console.log('\n' + '='.repeat(80))
    console.log('BFSG / WCAG 2.1 AA ACCESSIBILITY AUDIT PASSED ON ALL KEY SCREENS!')
    console.log('='.repeat(80) + '\n')
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
