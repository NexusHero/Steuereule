import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { AdvisorChatPanel } from '../AdvisorChatPanel'
import type { DictationEngine } from '../../../lib/dictation/engine'
import { renderInApp } from '../../../test-render'

function fakeEngine(over: Partial<DictationEngine> = {}): DictationEngine {
  return {
    support: vi.fn(async () => ({ supported: true as const })),
    isModelCached: vi.fn(async () => true),
    downloadModel: vi.fn(async (onProgress: (l: number, t: number) => void) => onProgress(10, 10)),
    record: vi.fn(async () => ({ stop: async () => new Float32Array(16), cancel: () => {} })),
    transcribe: vi.fn(async () => '300 Euro Spenden'),
    deleteModel: vi.fn(async () => {}),
    ...over,
  }
}

function renderPanel(engine: DictationEngine) {
  renderInApp(<AdvisorChatPanel messages={[]} onSendMessage={vi.fn()} dictationEngine={engine} />)
}

const press = async (id: string) => {
  const control = await screen.findByTestId(id)
  await act(async () => {
    fireEvent.click(control)
  })
}

describe('dictation, the ways it stops', () => {
  it('says the dictation failed when the sound cannot be read, and leaves the field alone', async () => {
    renderPanel(fakeEngine({ transcribe: async () => Promise.reject(new Error('boom')) }))
    await press('advisor-dictation-mic')
    expect(await screen.findByTestId('dictation-recording')).toBeDefined()
    await press('advisor-dictation-mic')
    expect((await screen.findByTestId('dictation-error')).textContent).not.toBe('')
    expect((screen.getByTestId('advisor-chat-input') as HTMLTextAreaElement).value).toBe('')
  })

  it('puts nothing into the field when nothing was understood, and is ready again', async () => {
    renderPanel(fakeEngine({ transcribe: async () => '' }))
    await press('advisor-dictation-mic')
    await press('advisor-dictation-mic')
    await waitFor(() => expect(screen.queryByTestId('dictation-transcribing')).toBeNull())
    expect(screen.queryByTestId('dictation-error')).toBeNull()
    expect((screen.getByTestId('advisor-chat-input') as HTMLTextAreaElement).value).toBe('')
  })

  it('says the download failed, in words that are not about the checksum, and never records', async () => {
    const engine = fakeEngine({ isModelCached: async () => false, downloadModel: async () => Promise.reject(new Error('offline')) })
    renderPanel(engine)
    await press('advisor-dictation-mic')
    await press('dictation-consent-accept')
    const message = (await screen.findByTestId('dictation-error')).textContent ?? ''
    expect(message).not.toContain('Prüfsumme')
    expect(engine.record).not.toHaveBeenCalled()
  })

  it('shows how far the download is', async () => {
    let report: (loaded: number, total: number) => void = () => {}
    let finish: () => void = () => {}
    const engine = fakeEngine({
      isModelCached: async () => false,
      downloadModel: (onProgress) => {
        report = onProgress
        return new Promise<void>((resolve) => (finish = resolve))
      },
    })
    renderPanel(engine)
    await press('advisor-dictation-mic')
    await press('dictation-consent-accept')
    act(() => report(1, 4))
    expect((await screen.findByTestId('dictation-progress')).textContent).toContain('25')
    expect(screen.getByTestId('advisor-dictation-mic').getAttribute('aria-disabled')).toBe('true')
    await act(async () => finish())
  })

  it('stops recording quietly when the bar goes away while the microphone is open', async () => {
    const cancel = vi.fn()
    const engine = fakeEngine({ record: async () => ({ stop: async () => new Float32Array(1), cancel }) })
    const view = renderInApp(<AdvisorChatPanel messages={[]} onSendMessage={vi.fn()} dictationEngine={engine} />)
    await press('advisor-dictation-mic')
    await screen.findByTestId('dictation-recording')
    view.unmount()
    expect(cancel).toHaveBeenCalledOnce()
  })
})
