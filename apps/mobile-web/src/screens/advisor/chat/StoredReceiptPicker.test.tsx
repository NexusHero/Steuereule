import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test-msw-server'
import { renderInApp } from '../../../test-render'
import { StoredReceiptPicker } from './StoredReceiptPicker'

const receipt = (id: string, fileName: string, hasFile = true) => ({ id, fileName, hasFile })

function renderPicker(props: Partial<Parameters<typeof StoredReceiptPicker>[0]> = {}) {
  const onRead = vi.fn().mockResolvedValue(undefined)
  renderInApp(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StoredReceiptPicker onRead={onRead} {...props} />
    </QueryClientProvider>,
  )
  return { onRead }
}

function listReceipts(...items: ReturnType<typeof receipt>[]) {
  server.use(http.get('*/v1/belege', () => HttpResponse.json(items, { status: 200 })))
}

describe('StoredReceiptPicker', () => {
  it('asks for nothing until it is opened, then lists only documents with a stored original', async () => {
    listReceipts(receipt('b1', 'Fahrkarte.pdf'), receipt('b2', 'Ohne-Datei.pdf', false))
    renderPicker()
    expect(screen.queryByTestId('advisor-stored-receipt-b1')).toBeNull()
    fireEvent.click(screen.getByTestId('advisor-stored-receipts-toggle'))
    expect(await screen.findByTestId('advisor-stored-receipt-b1')).toBeDefined()
    expect(screen.queryByTestId('advisor-stored-receipt-b2')).toBeNull()
    fireEvent.click(screen.getByTestId('advisor-stored-receipts-toggle'))
    expect(screen.queryByTestId('advisor-stored-receipt-b1')).toBeNull()
  })

  it('says so when no document has an original to read', async () => {
    listReceipts(receipt('b2', 'Ohne-Datei.pdf', false))
    renderPicker()
    fireEvent.click(screen.getByTestId('advisor-stored-receipts-toggle'))
    await waitFor(() => expect(screen.getByTestId('advisor-stored-receipts').textContent).toContain('Belege'))
    expect(screen.queryByTestId('advisor-stored-receipt-b2')).toBeNull()
  })

  it('shows at most eight documents', async () => {
    listReceipts(...Array.from({ length: 10 }, (_, i) => receipt(`b${i}`, `Beleg-${i}.pdf`)))
    renderPicker()
    fireEvent.click(screen.getByTestId('advisor-stored-receipts-toggle'))
    await screen.findByTestId('advisor-stored-receipt-b0')
    expect(screen.getAllByTestId(/^advisor-stored-receipt-b\d$/)).toHaveLength(8)
  })

  it('reads the stored original and hands it to the owl as a file', async () => {
    listReceipts(receipt('b1', 'Fahrkarte.pdf'))
    server.use(http.get('*/v1/belege/b1/datei', () => new HttpResponse('PDF', { status: 200, headers: { 'content-type': 'application/pdf' } })))
    const { onRead } = renderPicker()
    fireEvent.click(screen.getByTestId('advisor-stored-receipts-toggle'))
    fireEvent.click(await screen.findByTestId('advisor-stored-receipt-b1'))
    await waitFor(() => expect(onRead).toHaveBeenCalledOnce())
    const [file, id] = onRead.mock.calls[0] as [File, string]
    expect(file.name).toBe('Fahrkarte.pdf')
    expect(file.type).toBe('application/pdf')
    expect(id).toBe('b1')
  })

  it('says the document could not be read when its original is gone, and reads nothing', async () => {
    listReceipts(receipt('b1', 'Fahrkarte.pdf'))
    server.use(http.get('*/v1/belege/b1/datei', () => new HttpResponse(null, { status: 404 })))
    const { onRead } = renderPicker()
    fireEvent.click(screen.getByTestId('advisor-stored-receipts-toggle'))
    fireEvent.click(await screen.findByTestId('advisor-stored-receipt-b1'))
    expect(await screen.findByTestId('advisor-stored-receipt-failed')).toBeDefined()
    expect(onRead).not.toHaveBeenCalled()
  })

  it('leads to the Belege tab when it is offered, and cannot be used while disabled', async () => {
    listReceipts(receipt('b1', 'Fahrkarte.pdf'))
    const onOpenReceipts = vi.fn()
    const { onRead } = renderPicker({ onOpenReceipts, disabled: true })
    fireEvent.click(screen.getByTestId('advisor-stored-receipts-toggle'))
    const item = await screen.findByTestId('advisor-stored-receipt-b1')
    fireEvent.click(item)
    expect(onRead).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('advisor-stored-receipts-all'))
    expect(onOpenReceipts).toHaveBeenCalledOnce()
  })
})
