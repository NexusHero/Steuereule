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
  await page.locator('[data-testid="sheet-schliessen"]').waitFor({ state: 'detached', timeout: 10_000 })

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

  // 7. Chat basics (#451 slice 1b): regenerate, edit-and-resend, copy, Markdown.
  const assistantMessages = page.locator('[data-testid="advisor-assistant-message"]')
  const writes = []
  page.on('request', (req) => {
    if (req.method() !== 'GET' && /\/advisor\/actions\//.test(req.url())) writes.push(req.url())
  })

  // 7a. A pending proposal, then „Neu generieren“: the old answer is replaced, its proposal is gone
  //     and was never applied; the turn count stays the same.
  await chatInput.fill('Bitte 450 € Spenden eintragen')
  await chatSend.click()
  await page.locator('[data-testid="advisor-action-card"]', { hasText: '450' }).first().waitFor({ state: 'visible', timeout: 10_000 })
  const answersBefore = await assistantMessages.count()
  await page.locator('[data-testid="advisor-message-regenerate"]').click()
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="advisor-assistant-message"]').length === n && !document.querySelector('[data-testid="advisor-thinking"]'),
    answersBefore,
    { timeout: 15_000 },
  )
  if ((await page.locator('[data-testid="advisor-action-card"]', { hasText: '450' }).count()) !== 1) {
    fail('[Scenario 24] After „Neu generieren“ exactly one 450 € proposal (the new one) must remain')
  }
  console.log('[Scenario 24] ✅ Regenerate replaces the latest answer, turn count unchanged')

  // 7b. Edit the latest question: the 450 € proposal is replaced by a 500 € one, nothing applied.
  await page.locator('[data-testid="advisor-message-edit"]').click()
  if ((await chatInput.inputValue()) !== 'Bitte 450 € Spenden eintragen') fail('[Scenario 24] Edit must put the last question into the field')
  await chatInput.fill('Bitte 500 € Spenden eintragen')
  await chatSend.click()
  await page.locator('[data-testid="advisor-action-card"]', { hasText: '500' }).first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.locator('[data-testid="advisor-action-card"]', { hasText: '450' }).waitFor({ state: 'detached', timeout: 10_000 })
  if (writes.length > 0) fail(`[Scenario 24] Regenerate/edit must never apply a proposal, saw ${writes.join(', ')}`)
  console.log('[Scenario 24] ✅ Edit-and-resend replaces the answer; the replaced proposal was never applied')

  // 7c. Copy the latest answer.
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: webOrigin })
  const copy = page.locator('[data-testid="advisor-message-copy"]').last()
  await copy.click()
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="advisor-message-copy"]')].some((b) => b.textContent === 'Kopiert'), null, { timeout: 5_000 })
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  if (!clip.includes('500')) fail(`[Scenario 24] Copy should put the answer on the clipboard, got ${JSON.stringify(clip.slice(0, 80))}`)
  console.log('[Scenario 24] ✅ Copy puts the answer on the clipboard and confirms „Kopiert“')

  // 7d. Markdown (KI stub: one stored answer as a model would write it). Bold, list and table are
  //     rendered, a javascript: link is not a link, an image is never fetched.
  const imageRequests = []
  page.on('request', (req) => {
    if (req.url().includes('tracker.example')) imageRequests.push(req.url())
  })
  await page.route('**/advisor/session', async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    json.messages = [
      ...json.messages,
      {
        id: 'stub-md',
        role: 'assistant',
        content: '**Fett** und _kursiv_\n\n- Punkt eins\n- Punkt zwei\n\n| Posten | Betrag |\n| --- | --- |\n| Spenden | 500 € |\n\n[böse](javascript:alert(1)) ![x](https://tracker.example/p.png)',
        meta: null,
        createdAt: new Date().toISOString(),
      },
    ]
    await route.fulfill({ response: res, json })
  })
  await page.reload({ waitUntil: 'networkidle' })
  if (await fragenTab.isVisible().catch(() => false)) await fragenTab.click()
  const md = assistantMessages.last()
  await md.waitFor({ state: 'visible', timeout: 10_000 })
  const mdText = await md.innerText()
  if (mdText.includes('**') || mdText.includes('| ---')) fail(`[Scenario 24] Markdown must be rendered, saw raw: ${mdText.slice(0, 120)}`)
  if (!mdText.includes('Punkt eins') || !mdText.includes('Spenden')) fail('[Scenario 24] Markdown list/table content missing')
  if ((await md.locator('a[href^="javascript:"]').count()) !== 0) fail('[Scenario 24] A javascript: link must never become a link')
  if (imageRequests.length > 0) fail('[Scenario 24] Markdown images must never be fetched')
  await page.unroute('**/advisor/session')
  console.log('[Scenario 24] ✅ Markdown rendered (bold, list, table); javascript: link inert; no image fetched')

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
