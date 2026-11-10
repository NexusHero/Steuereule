import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../../i18n/app-i18n'
import { AdvisorChatPanel } from '../AdvisorChatPanel'
import type { DictationEngine } from '../../../lib/dictation/engine'
import { ModelChecksumError } from '../../../lib/dictation/modelStore'

function fakeEngine(over: Partial<DictationEngine> = {}) {
  const engine: DictationEngine = {
    support: vi.fn(async () => ({ supported: true as const })),
    isModelCached: vi.fn(async () => false),
    downloadModel: vi.fn(async (onProgress: (l: number, t: number) => void) => onProgress(10, 10)),
    record: vi.fn(async () => ({ stop: async () => new Float32Array(16), cancel: () => {} })),
    transcribe: vi.fn(async () => '300 Euro Spenden'),
    deleteModel: vi.fn(async () => {}),
    ...over,
  }
  return engine
}

function renderPanel(engine: DictationEngine, onSendMessage = vi.fn()) {
  render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <AdvisorChatPanel messages={[]} onSendMessage={onSendMessage} dictationEngine={engine} />
      </ThemeProvider>
    </I18nextProvider>,
  )
  return { onSendMessage }
}

describe('dictation step 2 (#451 slice 5, AC 8)', () => {
  it('shows the mic only on a supported device; otherwise the step-1 hint stays', async () => {
    renderPanel(fakeEngine({ support: async () => ({ supported: false, reason: 'no-webgpu' }) }))
    await waitFor(() => expect(screen.getByTestId('advisor-dictation-hint')).toBeTruthy())
    expect(screen.queryByTestId('advisor-dictation-mic')).toBeNull()
  })

  it('asks for consent naming Hugging Face, the size and the IP address before any download', async () => {
    const engine = fakeEngine()
    renderPanel(engine)
    fireEvent.click(await screen.findByTestId('advisor-dictation-mic'))
    const consent = await screen.findByTestId('dictation-consent')
    expect(consent.textContent).toContain('Hugging Face (USA)')
    expect(consent.textContent).toContain('IP-Adresse')
    expect(consent.textContent).toMatch(/ca\. \d+ MB/)
    expect(engine.downloadModel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('dictation-consent-decline'))
    expect(screen.queryByTestId('dictation-consent')).toBeNull()
    expect(engine.downloadModel).not.toHaveBeenCalled()
    expect(engine.record).not.toHaveBeenCalled()
  })

  it('after consent loads, records, and puts the transcript into the field without sending it', async () => {
    const engine = fakeEngine()
    const { onSendMessage } = renderPanel(engine)
    fireEvent.click(await screen.findByTestId('advisor-dictation-mic'))
    const el_dictation_consent_accept = await screen.findByTestId('dictation-consent-accept')
    await act(async () => {
      fireEvent.click(el_dictation_consent_accept)
    })
    expect(engine.downloadModel).toHaveBeenCalledTimes(1)
    await screen.findByTestId('dictation-recording')
    await act(async () => {
      fireEvent.click(screen.getByTestId('advisor-dictation-mic'))
    })
    await waitFor(() => expect((screen.getByTestId('advisor-chat-input') as HTMLTextAreaElement).value).toBe('300 Euro Spenden'))
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('skips the consent once the verified model is on the device', async () => {
    const engine = fakeEngine({ isModelCached: async () => true })
    renderPanel(engine)
    const el_advisor_dictation_mic = await screen.findByTestId('advisor-dictation-mic')
    await act(async () => {
      fireEvent.click(el_advisor_dictation_mic)
    })
    expect(screen.queryByTestId('dictation-consent')).toBeNull()
    expect(engine.downloadModel).not.toHaveBeenCalled()
    expect(engine.record).toHaveBeenCalledTimes(1)
  })

  it('aborts on a checksum mismatch, says so and never records', async () => {
    const engine = fakeEngine({
      downloadModel: async () => {
        throw new ModelChecksumError('onnx/encoder_model_quantized.onnx')
      },
    })
    renderPanel(engine)
    fireEvent.click(await screen.findByTestId('advisor-dictation-mic'))
    const el_dictation_consent_accept = await screen.findByTestId('dictation-consent-accept')
    await act(async () => {
      fireEvent.click(el_dictation_consent_accept)
    })
    expect((await screen.findByTestId('dictation-error')).textContent).toContain('stimmt nicht')
    expect(engine.record).not.toHaveBeenCalled()
  })

  it('names a denied microphone honestly', async () => {
    const engine = fakeEngine({ isModelCached: async () => true, record: async () => Promise.reject(new Error('NotAllowedError')) })
    renderPanel(engine)
    const el_advisor_dictation_mic = await screen.findByTestId('advisor-dictation-mic')
    await act(async () => {
      fireEvent.click(el_advisor_dictation_mic)
    })
    expect((await screen.findByTestId('dictation-error')).textContent).toContain('Mikrofon')
  })
})
