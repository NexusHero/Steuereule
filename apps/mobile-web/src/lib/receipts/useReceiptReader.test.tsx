// The per-screen upload pipeline: the progress and outcome of every Beleg are kept apart, and a
// question "Für wen?" is answered by reading the same stored file again, never by a second upload.
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppI18n } from '../../i18n/app-i18n'

const mocks = vi.hoisted(() => ({
  captureReceipt: vi.fn(),
  createHolderFromDocument: vi.fn(),
  takeNameIntoProfile: vi.fn(async (): Promise<'taken' | 'kept' | 'failed'> => 'taken'),
}))
vi.mock('./captureReceipt', () => ({ captureReceipt: mocks.captureReceipt }))
vi.mock('./documentAssignment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./documentAssignment')>()),
  createHolderFromDocument: mocks.createHolderFromDocument,
  takeNameIntoProfile: mocks.takeNameIntoProfile,
}))

import { useReceiptReader, type ReceiptReadContext } from './useReceiptReader'

const file = new File(['%PDF'], 'lstb.pdf', { type: 'application/pdf' })
const PROCESSING = { state: 'vorschlaege', reason: null, pending: 1, applied: 0, draftsTaxYear: 2025 }
const OK = { ok: true, kind: 'lstb', receiptId: 'r1', rawText: 'text', textSource: 'pdf_text', response: { processing: PROCESSING } }
const ASKING = {
  ...OK,
  rawText: 'Lohnsteuerbescheinigung 2025\nName: Nora Sommer',
  response: { processing: PROCESSING, assignment: { question: { printedName: 'Nora Sommer', options: [] } } },
}

function setup(context?: ReceiptReadContext) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>{children}</I18nextProvider>
    </QueryClientProvider>
  )
  const hook = renderHook(() => useReceiptReader({ taxYear: 2025, ...(context ? { context } : {}) }), { wrapper })
  return { ...hook, invalidate }
}

beforeEach(() => {
  mocks.captureReceipt.mockReset()
  mocks.createHolderFromDocument.mockReset()
  mocks.takeNameIntoProfile.mockClear()
})

describe('useReceiptReader.read', () => {
  it('keeps the outcome of the read under the Beleg’s key and refreshes the lists', async () => {
    mocks.captureReceipt.mockResolvedValue(OK)
    const { result, invalidate } = setup()

    await act(async () => {
      await result.current.read('a', file)
    })

    expect(result.current.entries.a).toMatchObject({ phase: null, outcome: { state: 'vorschlaege', pending: 1 }, question: null, error: null })
    expect(invalidate).toHaveBeenCalled()
  })

  it('tells the pipeline the entry’s context, and an already stored Beleg', async () => {
    mocks.captureReceipt.mockResolvedValue(OK)
    const { result } = setup({ expectedKind: 'lstb' as never, mask: 'lstb' as never, person: 'B', kind: 'lstb', area: 'B' })

    await act(async () => {
      await result.current.read('a', file, 'stored-1')
    })

    expect(mocks.captureReceipt.mock.calls[0]![1]).toMatchObject({ taxYear: 2025, stageDraft: true, receiptId: 'stored-1', expectedKind: 'lstb', mask: 'lstb', person: 'B', kind: 'lstb', area: 'B' })
  })

  it('shows the progress phases while it reads', async () => {
    mocks.captureReceipt.mockImplementation(async (_file: File, options: { onPhase: (p: string) => void }) => {
      options.onPhase('ocr')
      return OK
    })
    const { result } = setup()
    await act(async () => {
      await result.current.read('a', file)
    })
    expect(result.current.entries.a?.phase).toBeNull()
  })

  it('files the invalidation of the year the Beleg was filed in as well', async () => {
    mocks.captureReceipt.mockResolvedValue({ ...OK, response: { processing: PROCESSING, filedInTaxYear: 2024 } })
    const { result, invalidate } = setup()
    await act(async () => {
      await result.current.read('a', file)
    })
    expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(5)
  })

  it('records a failure as an unreadable Beleg instead of throwing', async () => {
    mocks.captureReceipt.mockResolvedValue({ ok: false, failure: 'empty_text', receiptId: 'r1', processing: null })
    const { result } = setup()
    await act(async () => {
      await result.current.read('a', file)
    })
    expect(result.current.entries.a?.outcome).toMatchObject({ state: 'nicht_lesbar', reason: 'kein_text' })
  })

  it('treats a pipeline that throws as a failed parse', async () => {
    mocks.captureReceipt.mockRejectedValue(new Error('boom'))
    const { result } = setup()
    await act(async () => {
      await result.current.read('a', file, 'r9')
    })
    expect(result.current.entries.a?.outcome).toMatchObject({ state: 'nicht_lesbar', reason: 'lesefehler' })
  })
})

describe('the question "Für wen?"', () => {
  it('keeps the question with the details printed on the document', async () => {
    mocks.captureReceipt.mockResolvedValue(ASKING)
    const { result } = setup()
    await act(async () => {
      await result.current.read('a', file)
    })
    expect(result.current.entries.a?.question?.question).toMatchObject({ printedName: 'Nora Sommer' })
  })

  it('answers by reading the stored file again for the chosen holder, without a new upload', async () => {
    mocks.captureReceipt.mockResolvedValueOnce(ASKING).mockResolvedValueOnce(OK)
    const { result } = setup({ kind: 'lstb', area: 'A' })
    await act(async () => {
      await result.current.read('a', file)
    })

    await act(async () => {
      await result.current.choose('a', 'B')
    })

    const second = mocks.captureReceipt.mock.calls[1]![1]
    expect(second).toMatchObject({ holder: 'B', kind: 'lstb', receiptId: 'r1' })
    expect(second).not.toHaveProperty('area')
    expect(result.current.entries.a?.question).toBeNull()
  })

  it('does nothing for a Beleg it has not read', async () => {
    const { result } = setup()
    await act(async () => {
      await result.current.choose('missing', 'B')
      await result.current.create('missing', 'B', { firstName: 'a', lastName: 'b', birthDate: '2000-01-01', taxId: '' })
      await result.current.confirmSelf('missing', true)
    })
    expect(mocks.captureReceipt).not.toHaveBeenCalled()
  })

  it('creates the person and reads again for them', async () => {
    mocks.captureReceipt.mockResolvedValueOnce(ASKING).mockResolvedValueOnce(OK)
    mocks.createHolderFromDocument.mockResolvedValue('kind:k1')
    const { result } = setup()
    await act(async () => {
      await result.current.read('a', file)
    })

    await act(async () => {
      await result.current.create('a', 'kind', { firstName: 'Lio', lastName: 'S', birthDate: '2019-04-03', taxId: '' })
    })

    expect(mocks.captureReceipt.mock.calls[1]![1]).toMatchObject({ holder: 'kind:k1' })
  })

  it('says so and does not read again when the person could not be created', async () => {
    mocks.captureReceipt.mockResolvedValueOnce(ASKING)
    mocks.createHolderFromDocument.mockResolvedValue(null)
    const { result } = setup()
    await act(async () => {
      await result.current.read('a', file)
    })

    await act(async () => {
      await result.current.create('a', 'B', { firstName: 'N', lastName: 'S', birthDate: '1990-01-01', taxId: '' })
    })

    await waitFor(() => expect(result.current.entries.a?.error).toBeTruthy())
    expect(mocks.captureReceipt).toHaveBeenCalledTimes(1)
  })

  it('confirms "that is me", taking the printed name into the profile only on request', async () => {
    mocks.captureReceipt.mockResolvedValue(ASKING)
    const { result } = setup()
    await act(async () => {
      await result.current.read('a', file)
    })

    await act(async () => {
      await result.current.confirmSelf('a', false)
    })
    expect(mocks.takeNameIntoProfile).not.toHaveBeenCalled()
    expect(mocks.captureReceipt.mock.calls[1]![1]).toMatchObject({ holder: 'A' })

    await act(async () => {
      await result.current.confirmSelf('a', true)
    })
    expect(mocks.takeNameIntoProfile).toHaveBeenCalledOnce()
  })

  it('WEB-32: says so when the name could not go into the profile, and still assigns the Beleg', async () => {
    mocks.captureReceipt.mockResolvedValue(ASKING)
    mocks.takeNameIntoProfile.mockResolvedValueOnce('failed')
    const { result } = setup()
    await act(async () => {
      await result.current.read('a', file)
    })
    await act(async () => {
      await result.current.confirmSelf('a', true)
    })
    expect(mocks.captureReceipt.mock.calls[1]![1]).toMatchObject({ holder: 'A' })
    expect(result.current.entries['a']?.error).toBe('Dein Name konnte nicht ins Profil übernommen werden. Der Beleg ist dir trotzdem zugeordnet – trag den Namen bitte im Profil ein.')
  })
})
