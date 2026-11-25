// Applying and undoing drafts through the bridge: every answer of the API has its own words for the user.
import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { AdvisorActionProposal } from '@steuereule/core'
import { server } from '../../test-msw-server'
import { CopilotBridgeHarness } from '../../test-advisor'
import { useCopilotBridge } from './CopilotBridgeProvider'

const draft = (actionId: string, screenName: AdvisorActionProposal['screen'] = 'interview'): AdvisorActionProposal => ({
  actionId,
  status: 'pending',
  screen: screenName,
  field: 'spenden',
  instance: null,
  label: `Entwurf ${actionId}`,
  previousValue: null,
  newValue: '100',
  beforeRefundEur: 0,
  afterRefundEur: 0,
  deltaEur: 25,
  reason: '',
  sourceId: 'estg-10b',
})

function Probe() {
  const bridge = useCopilotBridge()
  const drafts = [draft('d1'), draft('d2', 'lstb')]
  return (
    <div>
      <button data-testid="apply-all" onClick={() => void bridge.applyAllPending(drafts, { stay: true })} />
      <button data-testid="apply-all-leave" onClick={() => void bridge.applyAllPending(drafts)} />
      <button data-testid="apply-none" onClick={() => void bridge.applyAllPending([])} />
      <button data-testid="apply-ack" onClick={() => void bridge.applyAllPending(drafts, { stay: true, acknowledgedConflict: bridge.staleConflict ?? undefined })} />
      <button data-testid="apply-one" onClick={() => void bridge.applySingleAction('d1')} />
      <button data-testid="undo-one" onClick={() => void bridge.undoSingleAction('d1')} />
      <button data-testid="parse" onClick={() => void bridge.parseReceipt({ fileName: 'beleg.pdf', rawText: 'Rechnung 12,00 EUR' })} />
      <button data-testid="parse-stage" onClick={() => void bridge.parseReceipt({ fileName: 'beleg.pdf', rawText: 'x', mimeType: 'application/pdf', stageDraft: false })} />
      <button data-testid="clear-error" onClick={() => bridge.clearChatError()} />
      <span data-testid="parsed">{bridge.lastParsedReceipt ? bridge.lastParsedReceipt.parsed.summary : 'none'}</span>
      <span data-testid="linked">{[...bridge.receiptLinkedActionIds].join(',')}</span>
      <button data-testid="stop" onClick={() => bridge.stopStreaming()} />
      <button data-testid="clear-conflict" onClick={() => bridge.clearStaleConflict()} />
      <span data-testid="error">{bridge.chatError ?? 'none'}</span>
      <span data-testid="failure">{bridge.applyFailure ? `${bridge.applyFailure.actionId}:${bridge.applyFailure.message}` : 'none'}</span>
      <span data-testid="conflict">{bridge.staleConflict ? `${bridge.staleConflict.message}|${bridge.staleConflict.conflicts.map((c) => `${c.actionId ?? '*'}.${c.key}=${String(c.currentValue)}`).join(',')}` : 'none'}</span>
      <span data-testid="banner">{bridge.cockpitBanner ? `${bridge.cockpitBanner.appliedCount}:${bridge.cockpitBanner.screens.join('+')}:${bridge.cockpitBanner.lastDeltaEur}` : 'none'}</span>
      <span data-testid="applying">{String(bridge.batchApplying)}</span>
    </div>
  )
}

const mount = () => render(<CopilotBridgeHarness><Probe /></CopilotBridgeHarness>)
const click = (id: string) => act(() => screen.getByTestId(id).click())

describe('applying all drafts at once', () => {
  it('banks what was applied and says how many and where', async () => {
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/apply-batch', () => HttpResponse.json({ actions: [draft('d1'), draft('d2', 'lstb')] }, { status: 200 })))
    mount()
    click('apply-all')
    await waitFor(() => expect(screen.getByTestId('banner').textContent).toBe('2:interview+lstb:50'))
  })

  it('goes to the cockpit when the user does not stay in the owl', async () => {
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/apply-batch', () => HttpResponse.json({ actions: [draft('d1')] }, { status: 200 })))
    mount()
    click('apply-all-leave')
    await waitFor(() => expect(screen.getByTestId('banner').textContent).toBe('1:interview:25'))
  })

  it('does nothing without drafts', () => {
    mount()
    click('apply-none')
    expect(screen.getByTestId('applying').textContent).toBe('false')
    expect(screen.getByTestId('banner').textContent).toBe('none')
  })

  it('keeps what the user changed meanwhile: it names the fields and lets the user accept the current values', async () => {
    let bodies: unknown[] = []
    server.use(
      http.post('*/v1/steuerjahre/:jahr/advisor/actions/apply-batch', async ({ request }) => {
        bodies.push(await request.json())
        return bodies.length === 1
          ? HttpResponse.json(
              {
                message: 'Ein Wert wurde geändert.',
                details: { conflicts: [{ actionId: 'd1', key: 'spenden', currentValue: '80' }, { key: 'alle', currentValue: null }, { key: 3 }, 'kaputt', { key: 'x', currentValue: 5 }] },
              },
              { status: 409 },
            )
          : HttpResponse.json({ actions: [draft('d1'), draft('d2', 'lstb')] }, { status: 200 })
      }),
    )
    mount()
    click('apply-all')
    await waitFor(() => expect(screen.getByTestId('conflict').textContent).toBe('Ein Wert wurde geändert.|d1.spenden=80,*.alle=null'))
    click('apply-ack')
    await waitFor(() => expect(screen.getByTestId('banner').textContent).toBe('2:interview+lstb:50'))
    expect(bodies[1]).toEqual({
      drafts: [
        { actionId: 'd1', acknowledgedCurrentValues: { spenden: '80', alle: null } },
        { actionId: 'd2', acknowledgedCurrentValues: { alle: null } },
      ],
    })
    expect(screen.getByTestId('conflict').textContent).toBe('none')
  })

  it('names a conflict plainly when the server gives no reason, and can be told to forget it', async () => {
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/apply-batch', () => HttpResponse.json({ details: { conflicts: 'kaputt' } }, { status: 409 })))
    mount()
    click('apply-all')
    await waitFor(() => expect(screen.getByTestId('conflict').textContent).toContain('zwischenzeitlich manuell geändert'))
    click('clear-conflict')
    expect(screen.getByTestId('conflict').textContent).toBe('none')
  })

  it('reads a conflict without details as one without fields', async () => {
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/apply-batch', () => HttpResponse.json({ message: 'Konflikt', details: {} }, { status: 409 })))
    mount()
    click('apply-all')
    await waitFor(() => expect(screen.getByTestId('conflict').textContent).toBe('Konflikt|'))
  })

  it('says what went wrong when the batch is refused, or cannot be sent', async () => {
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/apply-batch', () => HttpResponse.json({ message: 'Zeitraum gesperrt.' }, { status: 422 })))
    mount()
    click('apply-all')
    await waitFor(() => expect(screen.getByTestId('applying').textContent).toBe('false'))
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/apply-batch', () => HttpResponse.error()))
    click('apply-all')
    await waitFor(() => expect(screen.getByTestId('applying').textContent).toBe('false'))
    expect(screen.getByTestId('banner').textContent).toBe('none')
  })
})

describe('applying and undoing one draft', () => {
  it('says in the API words why a draft could not be written, and in plain words when it could not be asked', async () => {
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/:id/apply', () => HttpResponse.json({ message: 'Das Feld ist gesperrt.' }, { status: 422 })))
    mount()
    click('apply-one')
    await waitFor(() => expect(screen.getByTestId('failure').textContent).toBe('d1:Das Feld ist gesperrt.'))
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/:id/apply', () => HttpResponse.error()))
    click('apply-one')
    await waitFor(() => expect(screen.getByTestId('failure').textContent).toMatch(/^d1:.+/))
    expect(screen.getByTestId('failure').textContent).not.toContain('gesperrt')
  })

  it('keeps a conflict on a single draft for the user to decide', async () => {
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/:id/apply', () => HttpResponse.json({ details: { conflicts: [{ key: 'spenden', currentValue: '7' }] } }, { status: 409 })))
    mount()
    click('apply-one')
    await waitFor(() => expect(screen.getByTestId('conflict').textContent).toBe('Wert wurde zwischenzeitlich manuell geändert.|*.spenden=7'))
  })

  it('tells the user when an undo is refused, and adds nothing when it cannot be asked', async () => {
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/:id/undo', () => HttpResponse.json({ message: 'Danach wurde geändert.' }, { status: 409 })))
    mount()
    click('undo-one')
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('Danach wurde geändert.'))
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/actions/:id/undo', () => HttpResponse.error()))
    click('undo-one')
    // Nothing new to say: the earlier refusal stays as it was.
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('Danach wurde geändert.'))
  })
})

describe('stopping an answer', () => {
  it('does nothing when no answer is running', () => {
    mount()
    click('stop')
    expect(screen.getByTestId('error').textContent).toBe('none')
  })
})

describe('reading a receipt for the chat', () => {
  const parsed = (extra: Record<string, unknown> = {}) => ({
    mode: 'llm',
    securityBlocked: false,
    parsed: { summary: 'Fahrkarte 12,00 EUR', vendorCategory: 'fahrtkosten', suggestedField: null },
    ...extra,
  })

  it('keeps what was read and links the staged draft to its receipt', async () => {
    server.use(http.post('*/v1/belege/parse', () => HttpResponse.json(parsed({ stagedAction: draft('d9') }), { status: 200 })))
    mount()
    click('parse')
    await waitFor(() => expect(screen.getByTestId('parsed').textContent).toBe('Fahrkarte 12,00 EUR'))
    expect(screen.getByTestId('linked').textContent).toBe('d9')
  })

  it('reads a receipt without a staged draft and with the optional parts left out', async () => {
    server.use(http.post('*/v1/belege/parse', () => HttpResponse.json(parsed(), { status: 200 })))
    mount()
    click('parse-stage')
    await waitFor(() => expect(screen.getByTestId('parsed').textContent).toBe('Fahrkarte 12,00 EUR'))
    expect(screen.getByTestId('linked').textContent).toBe('')
  })

  it('says it when the check fails with a status, and when it cannot be reached', async () => {
    server.use(http.post('*/v1/belege/parse', () => HttpResponse.json({ message: 'zu gross' }, { status: 413 })))
    mount()
    click('parse')
    // WEB-10: the limit in words, never "HTTP 413".
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('Die Datei ist zu groß. Erlaubt sind höchstens 10 MB.'))
    click('clear-error')
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('none'))
    server.use(http.post('*/v1/belege/parse', () => HttpResponse.error()))
    click('parse')
    await waitFor(() => expect(screen.getByTestId('error').textContent).not.toBe('none'))
    expect(screen.getByTestId('parsed').textContent).toBe('none')
  })
})
