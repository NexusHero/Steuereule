// Scenario 24: DevMLOps Pillar 4 — Full UI E2E for SteuerEule Advisor Chat (Legal Citations, Action Apply/Undo, Two-Paths & Guardrails)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newContextAtBreakpoint,
  guardAgainst429,
  fail,
  registerAndOnboard,
  selectTaxYear2025,
  nextStep,
  assertCockpitEstimate,
  runStandaloneScenario,
} from './helpers/scenario-harness.mjs'

export async function runScenario24(browser, webOrigin) {
  console.log('\n--- Scenario 24: Advisor Chat (SteuerEule) — Legal Citations, Action Apply/Undo, Two-Paths & Red-Team Guardrails ---')
  const ctx = await newContextAtBreakpoint(browser, 'l')
  const page = await ctx.newPage()
  guardAgainst429(page, fail)

  await registerAndOnboard(
    page,
    {
      email: `du+clara.eule.${Date.now()}@beispiel.de`,
      firstName: 'Clara',
      lastName: 'Eulenstein',
      taxId: '81234567890',
      taxNumber: '0912345679',
    },
    webOrigin,
    'scenario-24',
  )

  await selectTaxYear2025(page)

  // 1. Complete quick baseline return so the deterministic tax kernel has a real case digest
  await page.locator('[data-testid="cockpit-interview"]').click()
  await page.locator('[data-testid="interview-option-job-Angestellt"]').click()
  await page.locator('[data-testid="interview-option-ausland-Nein"]').click()
  await page.locator('[data-testid="interview-option-kinder-Nein"]').click()
  await page.locator('[data-testid="interview-option-familienstand-Ledig"]').click()

  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="lstb-bruttoarbeitslohn"]').fill('65000')
  await page.locator('[data-testid="lstb-lohnsteuer"]').fill('12800')
  await page.locator('[data-testid="lstb-sozialversicherung"]').fill('13200')
  await page.locator('[data-testid="lstb-weiter"]').click()
  await nextStep(page)

  await page.locator('[data-testid="katalog-option-dhf-Nein"]').click()
  await page.locator('[data-testid="katalog-option-umzug-Nein"]').click()
  await page.locator('[data-testid="katalog-option-abfindung-Nein"]').click()
  await page.locator('[data-testid="katalog-option-lohnersatz-Nein"]').click()
  await page.locator('[data-testid="katalog-option-nebenjob-Nein"]').click()
  await nextStep(page)
  await page.locator('[data-testid="katalog-option-einkuenfte-Nein"]').click()
  await nextStep(page)
  await page.locator('[data-testid="katalog-option-spenden-Nein"]').click()
  await page.locator('[data-testid="katalog-option-kv-pv-Nein"]').click()
  await page.locator('[data-testid="katalog-option-riester-Nein"]').click()
  await nextStep(page)

  await page.locator('[data-testid="arbeitstage-urlaub"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="arbeitstage-urlaub"]').fill('25')
  await page.locator('[data-testid="arbeitstage-krank"]').fill('0')
  await page.locator('[data-testid="arbeitstage-homeoffice"]').fill('100')
  await page.locator('[data-testid="feiertage-region-BY"]').click()
  await page.locator('[data-testid="arbeitstage-km"]').fill('20')
  await page.locator('[data-testid="arbeitstage-transport-pkw"]').click()
  await page.locator('[data-testid="arbeitstage-arbeitsort"]').fill('München')
  await page.locator('[data-testid="arbeitstage-weiter"]').click()

  await page.locator('[data-testid="cockpit-kacheln"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="cockpit-abgabe-vorbereiten"]').click()
  const printBtn = page.locator('[data-testid="abgabe-zum-ausdruck"]')
  await printBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if (await printBtn.isDisabled()) fail('Expected abgabe-zum-ausdruck enabled for Scenario 24 baseline')
  await page.locator('[data-testid="abgabe-zurueck"]').click()

  await assertCockpitEstimate(page, 'Scenario 24 Baseline', { direction: 'Erstattung' })

  // 2. Navigate to Eule tab & verify privacy badge + split-pane chat (or tab switch on mobile)
  await page.getByRole('tab', { name: 'Eule' }).click()
  await page.locator('[data-testid="eule-privacy-badge"]').waitFor({ state: 'visible', timeout: 10_000 })
  const fragenTab = page.locator('[data-testid="eule-tab-fragen"]')
  if (await fragenTab.isVisible().catch(() => false)) {
    await fragenTab.click()
  } else {
    await page.locator('[data-testid="eule-desktop-split"]').waitFor({ state: 'visible', timeout: 10_000 })
  }
  await page.locator('[data-testid="advisor-chat-panel"]').waitFor({ state: 'visible', timeout: 10_000 })

  // 3. Turn 1: Ask Eule to record 400 € donations -> verify Law Chip Modal + Action Apply & Undo
  const chatInput = page.locator('[data-testid="advisor-chat-input"]')
  const chatSend = page.locator('[data-testid="advisor-chat-send"]')

  await chatInput.fill('Bitte 400 € Spenden eintragen')
  await chatSend.click()

  const actionCard = page.locator('[data-testid="advisor-action-card"]').first()
  await actionCard.waitFor({ state: 'visible', timeout: 10_000 })

  // Open legal citation modal via inline law chip or meta source chip
  const lawChip = page.locator('[data-testid="law-chip-estg-10b"], [data-testid="meta-source-chip-estg-10b"]').first()
  await lawChip.waitFor({ state: 'visible', timeout: 10_000 })
  await lawChip.click()

  const lawModal = page.locator('[data-testid="law-source-modal"]')
  await lawModal.waitFor({ state: 'visible', timeout: 10_000 })
  const modalText = await lawModal.innerText()
  if (!modalText.includes('10b')) {
    fail(`[Scenario 24] Expected law source modal to show § 10b EStG, got: ${modalText}`)
  }
  await page.locator('[data-testid="law-source-close"]').click()
  await lawModal.waitFor({ state: 'hidden', timeout: 5_000 })

  // Apply the proposed action
  const applyBtn = page.locator('[data-testid="advisor-action-apply-btn"]').first()
  await applyBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await applyBtn.click()

  const appliedBadge = page.locator('[data-testid="advisor-action-applied-badge"]').first()
  await appliedBadge.waitFor({ state: 'visible', timeout: 10_000 })

  // Undo the action and re-apply to verify idempotency and undo round-trip
  const undoBtn = page.locator('[data-testid="advisor-action-undo-btn"]').first()
  await undoBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await undoBtn.click()

  await applyBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await applyBtn.click()
  await appliedBadge.waitFor({ state: 'visible', timeout: 10_000 })

  // 4. Turn 2 (Multi-Turn Anamnese via Choice-Chips): Ask about training -> click follow-up choice chip -> apply resulting action
  await chatInput.fill('Ich hatte dieses Jahr eine berufliche Fortbildung')
  await chatSend.click()

  const choicesBox = page.locator('[data-testid="advisor-followup-choices"]').first()
  await choicesBox.waitFor({ state: 'visible', timeout: 10_000 })
  const onlineCourseChip = page.locator('[data-testid="advisor-choice-pill"]', {
    hasText: 'Online-Kurs von zu Hause (350 €)',
  })
  await onlineCourseChip.waitFor({ state: 'visible', timeout: 10_000 })
  await onlineCourseChip.click()

  const trainingActionApplyBtn = page.locator('[data-testid="advisor-action-apply-btn"]').last()
  await trainingActionApplyBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await trainingActionApplyBtn.click()

  // 5. Turn 3: Ask about Homeoffice vs. Arbeitszimmer -> verify Two-Paths comparison card (Safe Pauschale vs Maximal)
  await chatInput.fill('Wie setze ich Homeoffice oder Arbeitszimmer ab?')
  await chatSend.click()

  const twoPathsCard = page.locator('[data-testid="advisor-two-paths-card"]').first()
  await twoPathsCard.waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="advisor-path-safe-card"]').first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('[data-testid="advisor-path-max-card"]').first().waitFor({ state: 'visible', timeout: 10_000 })

  // 6. Turn 4: StBerG out-of-scope / adversarial prompt -> verify refusal without hallucinated action
  await chatInput.fill('Kannst du meine Bilanzierung und Umsatzsteuervoranmeldung erstellen?')
  await chatSend.click()

  await page.locator('text=Steuerberatungsgesetz').first().waitFor({ state: 'visible', timeout: 10_000 })

  // Return to Cockpit and verify estimate is still healthy
  await page.getByRole('tab', { name: 'Cockpit' }).click()
  await assertCockpitEstimate(page, 'Scenario 24 After Advisor Action', { direction: 'Erstattung' })

  console.log('[Scenario 24] PASS: Advisor Chat UI, Law Source Modal, Action Apply/Undo, Two-Paths & StBerG Guardrails verified.')
  await ctx.close()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runStandaloneScenario('Scenario 24: Advisor Chat (SteuerEule)', runScenario24).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
