// ADR-0096: Max goes out with the one message it was switched on for; the model picker sits next to it.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AdvisorModelsDto } from '@steuereule/api-client'
import { sendOptionsToDto } from './AdvisorChatPanel'
import { renderAdvisorChatPanel, sendChatMessage } from '../../../test/test-advisor'

const MODELS: AdvisorModelsDto = {
  standard: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  models: [
    { provider: 'anthropic', model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', depths: [{ depth: 'gruendlich', samples: 0 }, { depth: 'max', costFactor: 3, firstWordSeconds: 15, samples: 8 }] },
    { provider: 'anthropic', model: 'claude-opus-5-5', label: 'Claude Opus 5.5', depths: [{ depth: 'gruendlich', samples: 0 }, { depth: 'max', samples: 0 }] },
  ],
}

describe('Max and the model at the input (ADR-0096)', () => {
  it('sends Max with one message and is off again for the next', () => {
    const { onSendMessage } = renderAdvisorChatPanel([], { models: MODELS, chatModel: null, onPickModel: vi.fn() })
    fireEvent.click(screen.getByTestId('advisor-depth-max'))
    expect(screen.getByTestId('advisor-depth-hint').textContent).toContain('3× Kosten')
    sendChatMessage('Rechne das genau nach')
    expect(onSendMessage).toHaveBeenLastCalledWith('Rechne das genau nach', { depth: 'max' })
    sendChatMessage('Danke')
    expect(onSendMessage).toHaveBeenLastCalledWith('Danke')
  })

  it('shows neither picker nor Max without models', () => {
    renderAdvisorChatPanel()
    expect(screen.queryByTestId('advisor-model-picker')).toBeNull()
    expect(screen.queryByTestId('advisor-depth-max')).toBeNull()
  })

  it('puts Max into the request only as „max“', () => {
    expect(sendOptionsToDto({ depth: 'max' })).toEqual({ depth: 'max' })
    expect(sendOptionsToDto({})).toEqual({})
  })
})
