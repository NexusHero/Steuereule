import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import type { DictationEngine } from '../../lib/dictation/engine'
import { ProfileDictationModelSection } from './ProfileDictationModelSection'

function engineWith(stored: boolean): DictationEngine {
  let cached = stored
  return {
    support: async () => ({ supported: true }),
    isModelCached: async () => cached,
    downloadModel: async () => {},
    record: async () => ({ stop: async () => new Float32Array(), cancel: () => {} }),
    transcribe: async () => '',
    deleteModel: vi.fn(async () => {
      cached = false
    }),
  }
}

function renderSection(engine: DictationEngine) {
  render(
    <I18nextProvider i18n={createAppI18n('de')}>
      <ThemeProvider mode="light">
        <ProfileDictationModelSection engine={engine} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('„Sprachmodell löschen“ (#451 slice 5)', () => {
  it('is offered only while the model is stored, and deletes it', async () => {
    const engine = engineWith(true)
    renderSection(engine)
    const button = await screen.findByTestId('profil-sprachmodell-loeschen')
    await act(async () => {
      fireEvent.click(button)
    })
    expect(engine.deleteModel).toHaveBeenCalled()
    expect(screen.queryByTestId('profil-sprachmodell')).toBeNull()
  })

  it('stays hidden when nothing is stored', async () => {
    renderSection(engineWith(false))
    await act(async () => {})
    expect(screen.queryByTestId('profil-sprachmodell')).toBeNull()
  })
})
