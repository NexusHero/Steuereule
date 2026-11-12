// #444: receipts in the chat — a PDF or photo is the primary path, and a scanned LStB shows
// every field with its confidence plus a way into the mask where the values are taken over.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import type { AdvisorActionProposal, AdvisorChatMessageView } from '@steuereule/core'
import { createAppI18n } from '../../i18n/app-i18n'
import { AdvisorChatPanel } from './AdvisorChatPanel'

function renderPanel(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider>{ui}</ThemeProvider>
    </I18nextProvider>,
  )
}

function lstbAction(field: string, label: string, newValue: string, confidenceStatus: 'ok' | 'pruefen'): AdvisorActionProposal {
  return {
    actionId: `act-${field}`,
    status: 'pending',
    screen: 'lstb',
    field,
    instance: null,
    label,
    previousValue: null,
    newValue,
    beforeRefundEur: 0,
    afterRefundEur: 0,
    deltaEur: 0,
    reason: 'Aus Lohnsteuerbescheinigung',
    sourceId: 'estg-9-1',
    confidenceStatus,
  }
}

describe('AdvisorChatPanel — receipts in the chat', () => {
  it('hands a picked PDF or photo to the capture pipeline', async () => {
    const onFile = vi.fn()
    renderPanel(<AdvisorChatPanel messages={[]} onSendMessage={vi.fn()} onAttachReceiptFile={onFile} />)

    fireEvent.click(screen.getByTestId('advisor-receipt-attach-btn'))
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'quittung.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('advisor-receipt-file-input'), { target: { files: [photo] } })

    await waitFor(() => expect(onFile).toHaveBeenCalledWith(photo))
    expect(screen.getByText(/Das Bild geht an keine KI/)).toBeTruthy()
  })

  it('reads several picked files one after another, and lets a waiting one be taken out of the queue', async () => {
    const gates: Array<() => void> = []
    const onFile = vi.fn(() => new Promise<void>((resolve) => gates.push(resolve)))
    renderPanel(<AdvisorChatPanel messages={[]} onSendMessage={vi.fn()} onAttachReceiptFile={onFile} />)

    fireEvent.click(screen.getByTestId('advisor-receipt-attach-btn'))
    const a = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })
    const b = new File([new Uint8Array([2])], 'b.jpg', { type: 'image/jpeg' })
    const c = new File([new Uint8Array([3])], 'c.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('advisor-receipt-file-input'), { target: { files: [a, b, c] } })

    // Only the first is being read; the other two wait, named.
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1))
    expect(onFile).toHaveBeenLastCalledWith(a)
    expect(screen.getByTestId('advisor-receipt-queue').textContent).toContain('2 weitere Dateien')

    // Taking b out leaves c.
    fireEvent.click(screen.getAllByTestId('advisor-receipt-queue-item')[0]!)
    expect(screen.getAllByTestId('advisor-receipt-queue-item')).toHaveLength(1)

    gates.shift()!()
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(2))
    expect(onFile).toHaveBeenLastCalledWith(c)
    gates.shift()!()
    await waitFor(() => expect(screen.queryByTestId('advisor-receipt-queue')).toBeNull())
    expect(onFile).toHaveBeenCalledTimes(2)
  })

  it('shows progress while a receipt is read and the outcome notice afterwards', () => {
    renderPanel(
      <AdvisorChatPanel
        messages={[]}
        onSendMessage={vi.fn()}
        onAttachReceiptFile={vi.fn()}
        isParsingReceipt
        receiptProgress="Foto wird lokal gelesen …"
        receiptNotice="Diese Lohnsteuerbescheinigung gehört zum Steuerjahr 2024"
      />,
    )
    fireEvent.click(screen.getByTestId('advisor-receipt-attach-btn'))
    expect(screen.getByTestId('advisor-receipt-file').textContent).toContain('Foto wird lokal gelesen')
    expect(screen.getByTestId('advisor-receipt-notice').textContent).toContain('2024')
  })

  it('renders a scanned LStB with per-field confidence and opens the mask to take it over', () => {
    const onInspectMask = vi.fn()
    const message: AdvisorChatMessageView = {
      id: 'msg-1',
      role: 'assistant',
      content: 'Lohnsteuerbescheinigung (2025) analysiert.',
      createdAt: '2026-11-10T09:00:00.000Z',
      meta: {
        lstbScan: { receiptId: 'beleg-1', stage: 'deterministic', taxYearOnDocument: 2025, actionIds: ['act-a', 'act-b'] },
        actions: [
          lstbAction('bruttoarbeitslohn', 'Bruttoarbeitslohn (Zeile 3)', '48000', 'ok'),
          lstbAction('lohnsteuer', 'Einbehaltene Lohnsteuer (Zeile 4)', '', 'pruefen'),
        ],
      },
    } as unknown as AdvisorChatMessageView

    renderPanel(<AdvisorChatPanel messages={[message]} onSendMessage={vi.fn()} onInspectMask={onInspectMask} />)

    expect(screen.getByTestId('advisor-lstb-scan-status-bruttoarbeitslohn').textContent).toBe('sicher gelesen')
    expect(screen.getByTestId('advisor-lstb-scan-status-lohnsteuer').textContent).toBe('bitte prüfen')
    expect(screen.getByTestId('advisor-lstb-scan-row-lohnsteuer').textContent).toContain('nicht gelesen')

    fireEvent.click(screen.getByTestId('advisor-lstb-scan-review'))
    expect(onInspectMask).toHaveBeenCalledWith('lstb')
  })
})
