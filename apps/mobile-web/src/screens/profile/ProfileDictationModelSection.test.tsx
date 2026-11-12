import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import type { DictationEngine } from '../../lib/dictation/engine'
import { ProfileDictationModelSection } from './ProfileDictationModelSection'
import { renderInApp } from '../../test-render'

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
  renderInApp(<ProfileDictationModelSection engine={engine} />)
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
